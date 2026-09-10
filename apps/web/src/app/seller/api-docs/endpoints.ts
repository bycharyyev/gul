import type { ShopApiKeyScope } from "@topup-hub/types";

export type DocEndpoint = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  scope: ShopApiKeyScope;
  /** i18n key for the one-line description. */
  summary: string;
  /** Request body, as JSON, for the routes that take one. */
  body?: string;
};

export type DocSection = {
  id: string;
  /** i18n key for the section heading. */
  title: string;
  /** i18n key for the paragraph under it. */
  intro: string;
  endpoints: DocEndpoint[];
};

/**
 * The reference, written out rather than generated from the OpenAPI document.
 *
 * Generating it was the obvious idea and the wrong one: the schema knows the shape of a request
 * and nothing about which of a dozen routes somebody should call first, what a scope costs them,
 * or why a storefront id is optional. A page that lists everything in alphabetical order is a
 * schema dump, not documentation.
 *
 * Kept beside the page so the two move together, and typed against the real scope union so a
 * scope renamed in the API breaks the build here instead of quietly misleading a reader.
 */
export const API_SECTIONS: DocSection[] = [
  {
    id: "shop",
    title: "sellerCabinet.apiDocs.section.shop",
    intro: "sellerCabinet.apiDocs.section.shopIntro",
    endpoints: [
      {
        method: "GET",
        path: "/seller-api/me",
        scope: "products:read",
        summary: "sellerCabinet.apiDocs.ep.me",
      },
    ],
  },
  {
    id: "products",
    title: "sellerCabinet.apiDocs.section.products",
    intro: "sellerCabinet.apiDocs.section.productsIntro",
    endpoints: [
      {
        method: "GET",
        path: "/seller-api/products",
        scope: "products:read",
        summary: "sellerCabinet.apiDocs.ep.listProducts",
      },
      {
        method: "GET",
        path: "/seller-api/products/{id}",
        scope: "products:read",
        summary: "sellerCabinet.apiDocs.ep.getProduct",
      },
      {
        method: "POST",
        path: "/seller-api/products",
        scope: "products:write",
        summary: "sellerCabinet.apiDocs.ep.createProduct",
        body: `{
  "categoryId": "cmg1...",
  "sku": "BUKET-001",
  "name": "Букет «Рассвет»",
  "description": "15 роз",
  "imageUrl": "https://…/rose.jpg",
  "priceTmt": 350,
  "isEnabled": true,
  "storefrontId": null
}`,
      },
      {
        method: "PATCH",
        path: "/seller-api/products/{id}",
        scope: "products:write",
        summary: "sellerCabinet.apiDocs.ep.updateProduct",
        body: `{ "priceTmt": 390 }`,
      },
      {
        method: "DELETE",
        path: "/seller-api/products/{id}",
        scope: "products:write",
        summary: "sellerCabinet.apiDocs.ep.deleteProduct",
      },
    ],
  },
  {
    id: "storefronts",
    title: "sellerCabinet.apiDocs.section.storefronts",
    intro: "sellerCabinet.apiDocs.section.storefrontsIntro",
    endpoints: [
      {
        method: "GET",
        path: "/seller-api/storefronts",
        scope: "products:read",
        summary: "sellerCabinet.apiDocs.ep.listStorefronts",
      },
      {
        method: "POST",
        path: "/seller-api/storefronts",
        scope: "products:write",
        summary: "sellerCabinet.apiDocs.ep.createStorefront",
        body: `{ "name": "Новинки", "description": "Что приехало на этой неделе" }`,
      },
      {
        method: "PATCH",
        path: "/seller-api/storefronts/{id}",
        scope: "products:write",
        summary: "sellerCabinet.apiDocs.ep.updateStorefront",
        body: `{ "isEnabled": false }`,
      },
      {
        method: "DELETE",
        path: "/seller-api/storefronts/{id}",
        scope: "products:write",
        summary: "sellerCabinet.apiDocs.ep.deleteStorefront",
      },
    ],
  },
  {
    id: "orders",
    title: "sellerCabinet.apiDocs.section.orders",
    intro: "sellerCabinet.apiDocs.section.ordersIntro",
    endpoints: [
      {
        method: "GET",
        path: "/seller-api/orders",
        scope: "shop-orders:read",
        summary: "sellerCabinet.apiDocs.ep.listOrders",
      },
      {
        method: "PATCH",
        path: "/seller-api/orders/{id}/status",
        scope: "shop-orders:write",
        summary: "sellerCabinet.apiDocs.ep.updateOrderStatus",
        body: `{ "status": "SHIPPED" }`,
      },
    ],
  },
  {
    id: "channels",
    title: "sellerCabinet.apiDocs.section.channels",
    intro: "sellerCabinet.apiDocs.section.channelsIntro",
    endpoints: [
      {
        method: "GET",
        path: "/seller-api/channels",
        scope: "chat:read",
        summary: "sellerCabinet.apiDocs.ep.listChannels",
      },
      {
        method: "POST",
        path: "/seller-api/channels",
        scope: "chat:write",
        summary: "sellerCabinet.apiDocs.ep.createChannel",
        body: `{ "title": "Гульбахар · новинки", "description": "Букеты недели" }`,
      },
      {
        method: "GET",
        path: "/seller-api/channels/{id}/messages?limit=50",
        scope: "chat:read",
        summary: "sellerCabinet.apiDocs.ep.channelMessages",
      },
      {
        method: "POST",
        path: "/seller-api/channels/{id}/messages",
        scope: "chat:write",
        summary: "sellerCabinet.apiDocs.ep.postToChannel",
        body: `{ "body": "Завтра привезём пионы" }`,
      },
    ],
  },
  {
    id: "chats",
    title: "sellerCabinet.apiDocs.section.chats",
    intro: "sellerCabinet.apiDocs.section.chatsIntro",
    endpoints: [
      {
        method: "GET",
        path: "/seller-api/chats?limit=50",
        scope: "chat:read",
        summary: "sellerCabinet.apiDocs.ep.listChats",
      },
      {
        method: "GET",
        path: "/seller-api/chats/{id}/messages",
        scope: "chat:read",
        summary: "sellerCabinet.apiDocs.ep.chatMessages",
      },
      {
        method: "POST",
        path: "/seller-api/chats/{id}/messages",
        scope: "chat:write",
        summary: "sellerCabinet.apiDocs.ep.replyToChat",
        body: `{ "body": "Собираем, будет готов к 15:00" }`,
      },
    ],
  },
];

export const METHOD_COLORS: Record<DocEndpoint["method"], string> = {
  GET: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  POST: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  PATCH: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  DELETE: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};
