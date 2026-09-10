import { useTranslation } from "@topup-hub/i18n";
import { Card } from "@/components/ui/card";

const NETDATA_URL = (import.meta.env.VITE_NETDATA_URL as string | undefined) ?? "/netdata/";

export default function MonitoringPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("admin.monitoring.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("admin.monitoring.description")}</p>
      </div>

      <Card className="overflow-hidden p-0">
        <iframe
          src={NETDATA_URL}
          title="Netdata"
          className="h-[calc(100vh-220px)] w-full border-0"
        />
      </Card>
    </div>
  );
}
