import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

/// Keeps feed videos on the device so watching one twice costs one download.
///
/// Only the file is cached. Everything about a post that can change -- likes, saves, view counts,
/// the caption, whether it is still published -- keeps coming from the API on every load, because
/// none of it lives here. That split is the point: the bytes of a video never change once
/// published, and they are the expensive part; the numbers change constantly and are cheap.
///
/// Nothing in here ever throws at a caller. A cache is an optimisation, and a feed that fails to
/// play a video because its *cache* broke would be worse than one with no cache at all -- every
/// failure path ends in "play it from the network instead".
class VideoCache {
  VideoCache({Dio? client, Future<Directory> Function()? directory})
    : _client = client ?? Dio(),
      _directory = directory ?? getTemporaryDirectory;

  static final VideoCache instance = VideoCache();

  final Dio _client;
  final Future<Directory> Function() _directory;

  /// Downloads already running, by url. Two posts can point at the same video, and the feed asks
  /// for the next one before the current one has finished arriving; without this the same bytes
  /// would be fetched twice and the two writers would race over one file.
  final Map<String, Future<File?>> _inFlight = {};

  /// How much of the device's cache directory this may occupy. The OS can clear the whole
  /// directory whenever it wants, so this is a ceiling on our own politeness, not a guarantee.
  static const int maxBytes = 256 * 1024 * 1024;

  Directory? _dir;

  Future<Directory?> _folder() async {
    if (_dir != null) return _dir;
    try {
      final dir = Directory('${(await _directory()).path}/feed-video');
      if (!dir.existsSync()) await dir.create(recursive: true);
      return _dir = dir;
    } catch (error) {
      debugPrint('VideoCache: no cache directory ($error)');
      return null;
    }
  }

  /// A url's file name. SHA-1 of the whole url, so two videos cannot collide onto one file and a
  /// signed url with query parameters still lands somewhere legal on every filesystem.
  static String fileNameFor(String url) => '${sha1.convert(utf8.encode(url))}.bin';

  /// The local file for [url], or null if it is not cached.
  ///
  /// Reading it counts as use: the timestamp is pushed forward so eviction drops what nobody
  /// watches rather than whatever happens to be oldest.
  Future<File?> cached(String url) async {
    final dir = await _folder();
    if (dir == null) return null;
    final file = File('${dir.path}/${fileNameFor(url)}');
    try {
      if (!file.existsSync()) return null;
      if (await file.length() == 0) return null;
      unawaited(
        file.setLastModified(DateTime.now()).catchError((_) {}),
      );
      return file;
    } catch (_) {
      return null;
    }
  }

  /// Puts [url] in the cache if it is not there yet, and returns the file.
  ///
  /// Called for the videos *after* the one being watched. Prefetching the one on screen would
  /// download it a second time while it is already streaming, which is the opposite of the point.
  Future<File?> prefetch(String url) {
    final running = _inFlight[url];
    if (running != null) return running;
    final started = _download(url).whenComplete(() => _inFlight.remove(url));
    _inFlight[url] = started;
    return started;
  }

  Future<File?> _download(String url) async {
    final existing = await cached(url);
    if (existing != null) return existing;
    final dir = await _folder();
    if (dir == null) return null;
    final target = File('${dir.path}/${fileNameFor(url)}');
    // Written beside the real name and renamed at the end. A download interrupted by a dead
    // connection or a killed app would otherwise leave a truncated file under the name the player
    // trusts, and that video would be broken until something evicted it.
    final partial = File('${target.path}.part');
    try {
      await _client.download(url, partial.path);
      if (await partial.length() == 0) throw const FileSystemException('empty');
      await partial.rename(target.path);
      unawaited(evict());
      return target;
    } catch (error) {
      debugPrint('VideoCache: could not cache $url ($error)');
      try {
        if (partial.existsSync()) await partial.delete();
      } catch (_) {}
      return null;
    }
  }

  /// Deletes least-recently-used files until the folder is under [maxBytes].
  Future<void> evict({int limit = maxBytes}) async {
    final dir = await _folder();
    if (dir == null) return;
    try {
      final files = <(File, FileStat)>[];
      await for (final entry in dir.list()) {
        if (entry is! File) continue;
        files.add((entry, entry.statSync()));
      }
      var total = files.fold<int>(0, (sum, f) => sum + f.$2.size);
      if (total <= limit) return;
      files.sort((a, b) => a.$2.modified.compareTo(b.$2.modified));
      for (final (file, stat) in files) {
        if (total <= limit) break;
        await file.delete();
        total -= stat.size;
      }
    } catch (error) {
      debugPrint('VideoCache: eviction failed ($error)');
    }
  }

  /// Everything the cache currently holds, in bytes. For the profile screen's storage line.
  Future<int> size() async {
    final dir = await _folder();
    if (dir == null) return 0;
    try {
      var total = 0;
      await for (final entry in dir.list()) {
        if (entry is File) total += await entry.length();
      }
      return total;
    } catch (_) {
      return 0;
    }
  }

  /// Drops every cached video. Offered to the person, not run on a schedule -- the cache exists
  /// to spend disk instead of their data, and only they know which they would rather spend.
  Future<void> clear() async {
    final dir = await _folder();
    if (dir == null) return;
    try {
      await for (final entry in dir.list()) {
        if (entry is File) await entry.delete();
      }
    } catch (error) {
      debugPrint('VideoCache: clear failed ($error)');
    }
  }
}
