// ---- Admin view of one seller shop ----

export interface AdminSellerDetailDto {
  id: string;
  userId: string;
  handle: string;
  shopName: string;
  description: string | null;
  logoUrl: string | null;
  balanceTmt: string;
  isEnabled: boolean;
  telegramLinked: boolean;
  createdAt: string;
  user: {
    id: string;
    email: string | null;
    phone: string | null;
    fullName: string | null;
    isBlocked: boolean;
    emailVerified: boolean;
    createdAt: string;
  };
  storefronts: { id: string; name: string; isEnabled: boolean }[];
  stats: {
    productCount: number;
    ordersByStatus: Record<string, number>;
    totalRevenueTmt: number;
  };
}
