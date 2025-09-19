export interface KpiConfigItem {
  key: string;
  label: string;
  type: 'number' | 'percent' | 'currency' | 'seconds';
  precision?: number;
  currency?: string;
}

export const DASHBOARD_KPI_CONFIG: Record<string, KpiConfigItem[]> = {
  FR: [
    { key: 'totalCalls', label: 'Appels Total', type: 'number' },
    { key: 'effectiveCalls', label: 'Appels Efficaces', type: 'number' },
    { key: 'conversionRate', label: 'Taux Transfo', type: 'percent', precision: 1 },
    { key: 'revenue', label: 'CA Jour', type: 'currency', currency: 'EUR', precision: 0 },
    { key: 'avgCallDurationSec', label: 'Durée Moy (s)', type: 'seconds' },
    { key: 'absenteeRate', label: 'Absence', type: 'percent', precision: 1 },
  ],
  CIV: [
    { key: 'totalInteractions', label: 'Interactions', type: 'number' },
    { key: 'salesCount', label: 'Ventes', type: 'number' },
    { key: 'avgBasket', label: 'Panier Moyen', type: 'currency', currency: 'XOF', precision: 0 },
    { key: 'upsellRate', label: 'Upsell', type: 'percent', precision: 1 },
    { key: 'churnRate', label: 'Churn', type: 'percent', precision: 1 },
    { key: 'conformityRate', label: 'Conformité', type: 'percent', precision: 1 },
  ],
};

export function formatKpiValue(value: any, cfg: KpiConfigItem): string {
  if (value === undefined || value === null) return '-';
  switch (cfg.type) {
    case 'number':
      return new Intl.NumberFormat('fr-FR').format(value as number);
    case 'percent':
      return ((value as number) * 100).toFixed(cfg.precision ?? 0) + '%';
    case 'currency':
      return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: cfg.currency || 'EUR', maximumFractionDigits: cfg.precision ?? 0 }).format(value as number);
    case 'seconds':
      return Math.round(value as number) + 's';
    default:
      return String(value);
  }
}
