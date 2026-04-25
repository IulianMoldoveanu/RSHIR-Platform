export type DailyRow = { day: string; revenue: number; order_count: number; avg_value: number };
export type TopItemRow = { item_id: string; item_name: string; order_count: number; revenue: number };
export type PeakRow = { dow: number; hour: number; order_count: number };
export type HeatmapPoint = { lat: number; lng: number };

export type Kpis = {
  todayRevenue: number;
  weekRevenue: number;
  monthRevenue: number;
  avgOrderValue30d: number;
};

export type AnalyticsData = {
  kpis: Kpis;
  daily: DailyRow[];
  topItems: TopItemRow[];
  peakHours: PeakRow[];
  heatmap: HeatmapPoint[];
};
