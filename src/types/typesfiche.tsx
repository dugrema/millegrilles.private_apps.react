export interface HostInfo {
  hostname: string;
  domaines?: string[];
  ip_addresses: string[];
  ports: Record<string, number>;
}

export interface PartitionUsageItem {
  mountpoint: string;
  free: number;
  used: number;
  total: number;
}

export interface MemoryInfo {
  total: number;
  available: number;
  percent: number;
  used: number;
  free: number;
}

export interface SwapInfo {
  total: number;
  used: number;
  free: number;
  percent: number;
}

export interface NetworkInfo {
  bytes_sent: number;
  bytes_recv: number;
  packets_sent: number;
  packets_recv: number;
  errin: number;
  errout: number;
  dropin: number;
  dropout: number;
}

export interface DiskIOInfo {
  read_bytes: number;
  write_bytes: number;
  read_count: number;
  write_count: number;
  read_time: number;
  write_time: number;
}

export interface SystemState {
  host?: HostInfo;
  disk: PartitionUsageItem[];
  load_average: number[];
  memory: MemoryInfo;
  swap: SwapInfo;
  cpu_count: number;
  cpu_usage_percent: number;
  network: NetworkInfo;
  disk_io?: DiskIOInfo;
  uptime_seconds: number;
  /** Maps to serde_json::Value */
  system_temperature?: any;
  /** Maps to serde_json::Value */
  system_fans?: any;
  /** Maps to serde_json::Value */
  apc?: any;
}

export interface ManagerStatusV2 {
  instance_id: string;
  system_state: SystemState;
  securite: string;
  supprime: boolean;
  /** ISO 8601 string (DateTime<Utc>) */
  timestamp: string;
}

export interface RequestServerInstancesResponseV2 {
  ok: boolean;
  results: ManagerStatusV2[];
}

export type InstanceByIdType = {[key: string]: ManagerStatusV2};

export interface InstanceMillegrille {
  domaines: string[] | null;
  ports: {[key: string]: Number};
  securite: string;
};

export interface FicheMillegrille {
  ca: string;
  idmg: string;
  chiffrage: Array<Array<string>>;
  applicationsV2: {[key: string]: any} | null;
  instances: {[key: string]: InstanceMillegrille} | null;
};
