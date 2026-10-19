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

// Owner contact details, editable by staff only. Shop fields are in UpdateSellerInput.
export interface AdminSellerContactInput {
  fullName?: string;
  email?: string;
  phone?: string;
}

// Staff correction of a pending application. Same rules as the public form.
export interface UpdateSellerApplicationInput {
  handle?: string;
  shopName?: string;
  description?: string;
  fullName?: string;
  email?: string;
  phone?: string;
}
