terraform {
  required_version = ">= 1.9.0"

  required_providers {
    clickhouse = {
      source  = "ClickHouse/clickhouse"
      version = "~> 3.18"
    }
    neon = {
      source  = "kislerdm/neon"
      version = "~> 0.14"
    }
  }
}
