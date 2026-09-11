import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:gulyaly_mobile/core/media/video_cache.dart';

void main() {
  late Directory root;
  late VideoCache cache;

  setUp(() async {
    root = await Directory.systemTemp.createTemp('video-cache-test');
    cache = VideoCache(directory: () async => root);
  });

  tearDown(() async {
    if (root.existsSync()) await root.delete(recursive: true);
  });

  Future<File> put(String url, {required int bytes, DateTime? used}) async {
    final file = File(
      '${root.path}/feed-video/${VideoCache.fileNameFor(url)}',
    );
    await file.parent.create(recursive: true);
    await file.writeAsBytes(List.filled(bytes, 0));
    if (used != null) await file.setLastModified(used);
    return file;
  }

  test('the same url always maps to the same file, and two urls never share one', () {
    // The name is what makes a cache a cache. If it drifted, every video would be downloaded
    // again; if two videos collided, someone would be shown the wrong one.
    expect(
      VideoCache.fileNameFor('https://s3/a.mp4'),
      VideoCache.fileNameFor('https://s3/a.mp4'),
    );
    expect(
      VideoCache.fileNameFor('https://s3/a.mp4'),
      isNot(VideoCache.fileNameFor('https://s3/b.mp4')),
    );
    // Query strings and non-ASCII names must still produce a legal filename.
    expect(
      VideoCache.fileNameFor('https://s3/гүл.mp4?sig=a/b+c'),
      matches(RegExp(r'^[0-9a-f]{40}\.bin$')),
    );
  });

  test('a miss is null, not an exception', () async {
    // Callers treat null as "stream it instead". A throw here would take the video down with it.
    expect(await cache.cached('https://s3/missing.mp4'), isNull);
  });

  test('a hit returns the file and counts as use', () async {
    final old = DateTime.now().subtract(const Duration(days: 3));
    await put('https://s3/a.mp4', bytes: 10, used: old);

    final hit = await cache.cached('https://s3/a.mp4');
    expect(hit, isNotNull);
    // Touched, so eviction drops what nobody watches rather than whatever is simply oldest.
    await Future<void>.delayed(const Duration(milliseconds: 20));
    expect(hit!.lastModifiedSync().isAfter(old), isTrue);
  });

  test('a half-written file is not offered as a video', () async {
    // What a download killed mid-flight leaves behind. Handing it to the player is a video that
    // never starts, and it would stay broken until something happened to evict it.
    await put('https://s3/truncated.mp4', bytes: 0);
    expect(await cache.cached('https://s3/truncated.mp4'), isNull);
  });

  test('eviction drops the least recently used until it is under the limit', () async {
    final now = DateTime.now();
    await put('https://s3/old.mp4', bytes: 400, used: now.subtract(const Duration(days: 2)));
    await put('https://s3/mid.mp4', bytes: 400, used: now.subtract(const Duration(days: 1)));
    await put('https://s3/new.mp4', bytes: 400, used: now);

    await cache.evict(limit: 900);

    expect(await cache.cached('https://s3/old.mp4'), isNull);
    expect(await cache.cached('https://s3/mid.mp4'), isNotNull);
    expect(await cache.cached('https://s3/new.mp4'), isNotNull);
  });

  test('eviction leaves a cache that already fits completely alone', () async {
    await put('https://s3/a.mp4', bytes: 100);
    await cache.evict(limit: 1000);
    expect(await cache.cached('https://s3/a.mp4'), isNotNull);
  });

  test('reports its size and can be emptied on request', () async {
    await put('https://s3/a.mp4', bytes: 120);
    await put('https://s3/b.mp4', bytes: 80);
    expect(await cache.size(), 200);

    await cache.clear();

    expect(await cache.size(), 0);
    expect(await cache.cached('https://s3/a.mp4'), isNull);
  });

  test('survives having no usable directory at all', () async {
    // A device that refuses a cache directory still has to be able to watch videos.
    final broken = VideoCache(
      directory: () async => throw const FileSystemException('no'),
    );
    expect(await broken.cached('https://s3/a.mp4'), isNull);
    expect(await broken.size(), 0);
    await broken.evict();
    await broken.clear();
  });
}
