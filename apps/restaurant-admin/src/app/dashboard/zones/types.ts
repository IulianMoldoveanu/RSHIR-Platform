export type Polygon = {
  type: 'Polygon';
  coordinates: [number, number][][];
};

export type Zone = {
  id: string;
  name: string;
  polygon: Polygon;
  is_active: boolean;
  sort_order: number;
  created_at: string;
};

export type Tier = {
  id: string;
  min_km: number;
  max_km: number;
  price_ron: number;
  sort_order: number;
};
