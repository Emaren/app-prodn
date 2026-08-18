import MarketplaceInvoiceClient from "@/components/market/MarketplaceInvoiceClient";

export default async function MarketplaceInvoicePage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  return <MarketplaceInvoiceClient publicId={decodeURIComponent(publicId)} />;
}
