import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  Prisma,
  SocialCommentStatus,
  SocialPostStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { buildViewerSignals, NO_SIGNALS, rankPage } from "./ranking";
import { AuditLogService } from "../audit-log/audit-log.service";
import { StorageService } from "../storage/storage.service";
import {
  autoModerate,
  REPORT_HIDE_THRESHOLD,
  TRUST_EPOCH,
  type AuthorStanding,
} from "./auto-moderation";
import type {
  CreateSocialCommentDto,
  CreateSocialPostDto,
  ModerateSocialCommentDto,
  ModerateSocialPostDto,
  UpdateSocialPostDto,
} from "./dto/social-feed.dto";

type Viewer = { userId: string; role: string };
const PRODUCT_SELECT = {
  id: true,
  name: true,
  sku: true,
  imageUrl: true,
  priceTmt: true,
  sellerId: true,
} as const;
const POST_INCLUDE = {
  author: {
    select: {
      id: true,
      fullName: true,
      username: true,
      avatarPath: true,
      // The shop behind the author, so a post can lead somewhere. Carried on the post rather than
      // fetched per author by the client: a feed of twelve posts would otherwise be twelve more
      // requests, and the button would appear a moment after the post it belongs to.
      sellerProfile: {
        select: {
          handle: true,
          shopName: true,
          logoUrl: true,
          isEnabled: true,
        },
      },
    },
  },
  products: {
    orderBy: { sortOrder: "asc" as const },
    include: { product: { select: PRODUCT_SELECT } },
  },
} as const;
type PostWithDetails = Prisma.SocialPostGetPayload<{
  include: typeof POST_INCLUDE;
}>;
const MAX_PAGE = 25;

function cleanText(value: string) {
  if (/[<>\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value))
    throw new BadRequestException(
      "HTML and control characters are not allowed",
    );
  return value.trim();
}

@Injectable()
export class SocialFeedService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditLogService,
    private storage: StorageService,
  ) {}

  private trustedMedia(url: string | undefined) {
    if (!url) return true;
    if (url.startsWith("/api/uploads/")) return true;
    // Ask storage where it puts things rather than re-deriving it. Reading S3_PUBLIC_BASE_URL
    // here looked equivalent and was not: the variable is optional, and with it unset -- which is
    // how production runs -- StorageService serves from the bucket's virtual-hosted URL while
    // this check saw no base at all and refused every upload. Photo and video posts could not be
    // published, and the message blamed the media.
    const base = this.storage.publicBase;
    return !!base && url.startsWith(`${base}/uploads/`);
  }

  private async assertTagProducts(productIds: string[]) {
    if (!productIds.length) return;
    const products = await this.prisma.galleryProduct.findMany({
      where: { id: { in: productIds }, isEnabled: true },
      select: { id: true },
    });
    if (products.length !== productIds.length)
      throw new BadRequestException(
        "Tagged products must be active Gallery products",
      );
  }

  async create(userId: string, dto: CreateSocialPostDto) {
    const body = dto.body ? cleanText(dto.body) : undefined;
    if (dto.mediaType === "TEXT" && !body)
      throw new BadRequestException("Text posts require body");
    if (dto.mediaType !== "TEXT" && !dto.mediaUrl)
      throw new BadRequestException("Media posts require mediaUrl");
    // A cover is optional. It used to be mandatory for video, which meant a person publishing one
    // had to shoot, upload, and then separately produce a still image for it -- a step nothing
    // downstream needs, since the player draws the first frame itself.
    if (
      !this.trustedMedia(dto.mediaUrl) ||
      !this.trustedMedia(dto.thumbnailUrl)
    )
      throw new BadRequestException("Only trusted uploaded media may be used");
    await this.assertTagProducts(dto.productIds);
    // An author a moderator has already approved three times does not need approving a fourth,
    // and holding their posts spends the queue on the safest content in it. See auto-moderation.ts
    // for what this does and does not check -- in particular, it never looks at an image.
    const verdict = autoModerate({
      body,
      hasMedia: dto.mediaType !== "TEXT",
      author: await this.authorStanding(userId),
    });
    // Returned in the same shape the feed serves, not as the raw row. The row's `products` are
    // join records with the product nested inside, and its author carries no avatar URL -- a
    // client that can read a feed item could not read this, and the post it had just created
    // looked to it like a failure. It had in fact been created, so the person was told publishing
    // failed and then found two of them.
    return this.publicShape(
      await this.prisma.socialPost.create({
        data: {
          authorId: userId,
          body,
          mediaType: dto.mediaType,
          mediaUrl: dto.mediaUrl,
          thumbnailUrl: dto.thumbnailUrl,
          status: verdict.status,
          moderationNote: verdict.reason,
          publishedAt: verdict.status === "PUBLISHED" ? new Date() : null,
          products: {
            create: dto.productIds.map((productId, sortOrder) => ({
              productId,
              sortOrder,
            })),
          },
        },
        include: POST_INCLUDE,
      }),
    );
  }

  /** What this author's record says, for the auto-moderation decision. */
  private async authorStanding(userId: string): Promise<AuthorStanding> {
    const [approvedPosts, upheldReports] = await Promise.all([
      this.prisma.socialPost.count({
        // Only approvals given under the current rule. See TRUST_EPOCH: counting older ones would
        // have granted automatic publication to every existing author the moment this shipped.
        where: {
          authorId: userId,
          status: "PUBLISHED",
          publishedAt: { gte: TRUST_EPOCH },
        },
      }),
      // A post of theirs a moderator rejected or hid is a complaint upheld against them. Counting
      // outcomes rather than raw reports is deliberate: anyone can file a report, and letting an
      // unreviewed one revoke somebody's standing would hand that lever to whoever complains most.
      this.prisma.socialPost.count({
        where: { authorId: userId, status: { in: ["REJECTED", "HIDDEN"] } },
      }),
    ]);
    return { approvedPosts, upheldReports };
  }

  async updateMine(id: string, userId: string, dto: UpdateSocialPostDto) {
    const post = await this.prisma.socialPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException("Post not found");
    if (post.authorId !== userId)
      throw new ForbiddenException("You can edit only your own post");
    if (post.status === "HIDDEN")
      throw new ForbiddenException("Hidden posts cannot be edited");
    const body =
      dto.body === undefined ? (post.body ?? undefined) : cleanText(dto.body);
    const mediaType = dto.mediaType ?? post.mediaType;
    const mediaUrl =
      dto.mediaUrl === undefined ? (post.mediaUrl ?? undefined) : dto.mediaUrl;
    const thumbnailUrl =
      dto.thumbnailUrl === undefined
        ? (post.thumbnailUrl ?? undefined)
        : dto.thumbnailUrl;
    if (mediaType === "TEXT" && !body)
      throw new BadRequestException("Text posts require body");
    if (mediaType !== "TEXT" && !mediaUrl)
      throw new BadRequestException("Media posts require mediaUrl");
    if (!this.trustedMedia(mediaUrl) || !this.trustedMedia(thumbnailUrl))
      throw new BadRequestException("Only trusted uploaded media may be used");
    if (dto.productIds) await this.assertTagProducts(dto.productIds);
    return this.publicShape(
      await this.prisma.socialPost.update({
        where: { id },
        data: {
          body,
          mediaType,
          mediaUrl,
          thumbnailUrl,
          status: "PENDING",
          moderationNote: null,
          publishedAt: null,
          ...(dto.productIds
            ? {
                products: {
                  deleteMany: {},
                  create: dto.productIds.map((productId, sortOrder) => ({
                    productId,
                    sortOrder,
                  })),
                },
              }
            : {}),
        },
        include: POST_INCLUDE,
      }),
    );
  }

  async removeMine(id: string, userId: string) {
    const claimed = await this.prisma.socialPost.deleteMany({
      where: { id, authorId: userId, status: { in: ["PENDING", "REJECTED"] } },
    });
    if (!claimed.count)
      throw new ForbiddenException(
        "Only your pending or rejected post can be deleted",
      );
  }

  async list(viewer?: Viewer, cursor?: string, take = 12) {
    const safeTake = Math.max(1, Math.min(take, MAX_PAGE));
    let cursorPost: { publishedAt: Date | null; id: string } | null = null;
    if (cursor) {
      cursorPost = await this.prisma.socialPost.findUnique({
        where: { id: cursor },
        select: { id: true, publishedAt: true },
      });
      if (!cursorPost?.publishedAt)
        throw new BadRequestException("Invalid cursor");
    }
    const cursorAt = cursorPost?.publishedAt ?? undefined;
    const posts = (await this.prisma.socialPost.findMany({
      where: {
        status: "PUBLISHED",
        ...(cursorAt
          ? {
              OR: [
                { publishedAt: { lt: cursorAt } },
                { publishedAt: cursorAt, id: { lt: cursorPost!.id } },
              ],
            }
          : {}),
      },
      // One more than the page, purely to learn whether another page exists. It used to fetch
      // three times the page because the per-author cap threw posts away and the page had to be
      // refilled from somewhere; nothing is thrown away now.
      take: safeTake + 1,
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      include: POST_INCLUDE,
    })) as PostWithDetails[];
    // The page is chosen chronologically and only then reordered. That split is the whole point:
    // `nextCursor` is a point in publication time, so if affinity were allowed to decide *which*
    // posts a page contains, the cursor would land on a post newer than others already shown and
    // the following page would serve them again. Ordering inside a page is free; membership is not.
    const hasMore = posts.length > safeTake;
    const selected = posts.slice(0, safeTake);
    const boundary = selected.at(-1);

    // Ordering lives in ranking.ts: weights, cold-start floor and author spread in one readable
    // place, as pure functions over plain rows. Membership stays here, decided by chronology, for
    // the cursor reason spelled out above.
    const ids = selected.map((p) => p.id);
    const interactions =
      viewer && ids.length
        ? await this.prisma.socialInteraction.findMany({
            where: {
              userId: viewer.userId,
              postId: { in: ids },
              type: { in: ["LIKE", "SAVE"] },
            },
            select: { postId: true, type: true },
          })
        : [];
    const byPost = new Map<string, Set<string>>();
    for (const x of interactions) {
      const set = byPost.get(x.postId) ?? new Set();
      set.add(x.type);
      byPost.set(x.postId, set);
    }
    // One history read, not two. Both signals it feeds -- who the viewer engages with, and which
    // products they engage with -- only reorder the page that chronology already fixed, so a
    // viewer sees the same posts as everyone else, arranged to suit them.
    const signals =
      viewer && selected.length > 1
        ? buildViewerSignals(
            await this.prisma.socialInteraction.findMany({
              where: {
                userId: viewer.userId,
                type: { in: ["LIKE", "SAVE", "PRODUCT_CLICK"] },
              },
              orderBy: { createdAt: "desc" },
              take: 300,
              select: {
                type: true,
                post: {
                  select: {
                    authorId: true,
                    products: { select: { productId: true } },
                  },
                },
              },
            }),
          )
        : NO_SIGNALS;
    const display = rankPage(selected, signals, new Date());

    return {
      items: display.map((p) => ({
        ...this.publicShape(p),
        isMine: viewer?.userId === p.authorId,
        viewer: viewer
          ? {
              liked: byPost.get(p.id)?.has("LIKE") ?? false,
              saved: byPost.get(p.id)?.has("SAVE") ?? false,
            }
          : undefined,
      })),
      // The oldest post on this page, not the last one displayed: display order is personalised
      // and says nothing about where the next page should start. Null unless another post exists,
      // so the client is never sent for a page that turns out to be empty.
      nextCursor: hasMore ? (boundary?.id ?? null) : null,
    };
  }

  /**
   * One post as clients see it: the stored row, plus the two things only the server can resolve --
   * where an avatar is served from, and which shop the author speaks for. Shared by the feed and
   * by an author's own list so the two cannot drift into describing the same post differently.
   */
  private publicShape(p: PostWithDetails) {
    const shop = p.author.sellerProfile;
    return {
      ...p,
      author: {
        id: p.author.id,
        fullName: p.author.fullName,
        username: p.author.username,
        avatarPath: p.author.avatarPath,
        // An avatar stored on S3 is already a whole URL. Prefixing the local route onto it
        // produced "/api/avatar/https://open.s3..." -- a relative path to nothing -- and every
        // author in the feed had rendered as an empty grey circle since avatars moved to S3.
        // auth.service.ts and avatar.service.ts have always made this distinction; this did not.
        avatarUrl: !p.author.avatarPath
          ? null
          : p.author.avatarPath.startsWith("http")
            ? p.author.avatarPath
            : `/api/avatar/${p.author.avatarPath}`,
        // Only an open shop is offered. A disabled one still owns its posts, but a button leading
        // to a page that refuses to load is worse than no button.
        shop:
          shop && shop.isEnabled
            ? {
                handle: shop.handle,
                shopName: shop.shopName,
                logoUrl: shop.logoUrl,
              }
            : null,
      },
      products: p.products.map((x) => x.product),
    };
  }

  /**
   * An author's own posts -- every status, newest first.
   *
   * Deliberately not the public feed filtered by author: what an author needs to see is exactly
   * what the feed exists to hide. A post awaiting moderation, or one that was rejected and why,
   * appears nowhere else, and without this an author who posted and saw nothing had no way to
   * tell a slow queue from a refusal.
   *
   * `canEdit`/`canDelete` are decided here, by the same rules `updateMine`/`removeMine` enforce,
   * so the buttons a client shows cannot drift away from what the server will actually allow.
   */
  async listMine(userId: string, cursor?: string, take = 20) {
    const safeTake = Math.max(1, Math.min(take, MAX_PAGE));
    let cursorPost: { createdAt: Date; id: string } | null = null;
    if (cursor) {
      cursorPost = await this.prisma.socialPost.findUnique({
        where: { id: cursor },
        select: { id: true, createdAt: true },
      });
      if (!cursorPost) throw new BadRequestException("Invalid cursor");
    }
    const posts = (await this.prisma.socialPost.findMany({
      where: {
        authorId: userId,
        ...(cursorPost
          ? {
              OR: [
                { createdAt: { lt: cursorPost.createdAt } },
                { createdAt: cursorPost.createdAt, id: { lt: cursorPost.id } },
              ],
            }
          : {}),
      },
      take: safeTake + 1,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: POST_INCLUDE,
    })) as PostWithDetails[];
    const hasMore = posts.length > safeTake;
    const selected = posts.slice(0, safeTake);
    return {
      items: selected.map((p) => ({
        ...this.publicShape(p),
        isMine: true,
        canEdit: p.status !== "HIDDEN",
        canDelete: p.status === "PENDING" || p.status === "REJECTED",
      })),
      nextCursor: hasMore ? (selected.at(-1)?.id ?? null) : null,
    };
  }

  private async published(id: string) {
    const post = await this.prisma.socialPost.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!post || post.status !== "PUBLISHED")
      throw new NotFoundException("Published post not found");
    return post;
  }

  async toggle(
    userId: string,
    postId: string,
    type: "LIKE" | "SAVE",
    active: boolean,
  ) {
    await this.published(postId);
    return this.prisma.$transaction(async (tx) => {
      if (active) {
        const result = await tx.socialInteraction.createMany({
          data: [{ userId, postId, type }],
          skipDuplicates: true,
        });
        if (result.count)
          await tx.socialPost.update({
            where: { id: postId },
            data:
              type === "LIKE"
                ? { likeCount: { increment: 1 } }
                : { saveCount: { increment: 1 } },
          });
      } else {
        const result = await tx.socialInteraction.deleteMany({
          where: { userId, postId, type },
        });
        if (result.count)
          await tx.socialPost.update({
            where: { id: postId },
            data:
              type === "LIKE"
                ? { likeCount: { decrement: 1 } }
                : { saveCount: { decrement: 1 } },
          });
      }
      return { active };
    });
  }

  async record(userId: string, postId: string, type: "VIEW" | "PRODUCT_CLICK") {
    await this.published(postId);
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.socialInteraction.createMany({
        data: [{ userId, postId, type }],
        skipDuplicates: true,
      });
      if (result.count)
        await tx.socialPost.update({
          where: { id: postId },
          data:
            type === "VIEW"
              ? { viewCount: { increment: 1 } }
              : { productClickCount: { increment: 1 } },
        });
      return { recorded: !!result.count };
    });
  }

  async comment(userId: string, postId: string, dto: CreateSocialCommentDto) {
    await this.published(postId);
    return this.prisma.socialComment.create({
      data: { userId, postId, body: cleanText(dto.body) },
    });
  }
  listComments(postId: string) {
    return this.prisma.socialComment.findMany({
      where: { postId, status: "PUBLISHED" },
      orderBy: { createdAt: "asc" },
      take: 100,
      select: {
        id: true,
        body: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            fullName: true,
            username: true,
            avatarPath: true,
          },
        },
      },
    });
  }
  async report(userId: string, postId: string, reason: string) {
    await this.published(postId);
    await this.prisma.socialPostReport.upsert({
      where: { postId_userId: { postId, userId } },
      create: { postId, userId, reason: cleanText(reason) },
      update: { reason: cleanText(reason) },
    });

    // Enough separate people objecting takes the post out of the feed until somebody looks at it.
    // Hiding is reversible and leaving it up is not: a post seen by thousands while it waits in a
    // queue cannot be unseen. The unique constraint on (postId, userId) is what makes the count
    // mean "distinct people" rather than "times the button was pressed".
    const reports = await this.prisma.socialPostReport.count({
      where: { postId },
    });
    if (reports >= REPORT_HIDE_THRESHOLD) {
      await this.prisma.socialPost.updateMany({
        where: { id: postId, status: "PUBLISHED" },
        data: {
          status: "HIDDEN",
          moderationNote: `auto:reported-by-${reports}`,
          publishedAt: null,
        },
      });
    }
    return { ok: true };
  }

  adminList(status?: SocialPostStatus) {
    return this.prisma.socialPost.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      include: POST_INCLUDE,
    });
  }
  /** Aggregate-only moderation queue: reporter identity is not exposed even to the UI contract. */
  adminReportQueue() {
    return this.prisma.socialPostReport.groupBy({
      by: ["postId"],
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    });
  }
  async moderatePost(id: string, dto: ModerateSocialPostDto, adminId: string) {
    const data = {
      status: dto.status as SocialPostStatus,
      moderationNote: dto.note ? cleanText(dto.note) : null,
      publishedAt: dto.status === "PUBLISHED" ? new Date() : null,
    };
    const post = await this.prisma.socialPost.update({
      where: { id },
      data,
      include: POST_INCLUDE,
    });
    this.audit.record(adminId, "social-feed.moderate-post", "SocialPost", id, {
      status: dto.status,
    });
    return post;
  }
  adminComments(status?: SocialCommentStatus) {
    return this.prisma.socialComment.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        post: { select: { id: true } },
        user: { select: { id: true, username: true, fullName: true } },
      },
    });
  }
  async moderateComment(
    id: string,
    dto: ModerateSocialCommentDto,
    adminId: string,
  ) {
    const old = await this.prisma.socialComment.findUnique({ where: { id } });
    if (!old) throw new NotFoundException("Comment not found");
    const published = dto.status === "PUBLISHED" && old.status !== "PUBLISHED";
    const hidden = dto.status !== "PUBLISHED" && old.status === "PUBLISHED";
    const result = await this.prisma.$transaction(async (tx) => {
      const comment = await tx.socialComment.update({
        where: { id },
        data: { status: dto.status as SocialCommentStatus },
      });
      if (published || hidden)
        await tx.socialPost.update({
          where: { id: old.postId },
          data: {
            commentCount: published ? { increment: 1 } : { decrement: 1 },
          },
        });
      return comment;
    });
    this.audit.record(
      adminId,
      "social-feed.moderate-comment",
      "SocialComment",
      id,
      { status: dto.status },
    );
    return result;
  }
}
