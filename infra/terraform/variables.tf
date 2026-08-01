variable "environment" {
  description = "Environment suffix used in managed resource names."
  type        = string
  default     = "development"

  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "environment must be development, staging, or production."
  }
}

variable "neon_region" {
  description = "Neon US East region identifier."
  type        = string
  default     = "aws-us-east-2"
}

variable "clickhouse_region" {
  description = "ClickHouse Cloud US East region identifier."
  type        = string
  default     = "us-east-1"
}

variable "clickhouse_allowed_cidr" {
  description = "CIDR permitted to connect to the audit service. Never use 0.0.0.0/0 outside short-lived development."
  type        = string
}

variable "clickhouse_owner_password" {
  description = "Initial ClickHouse service owner password."
  type        = string
  sensitive   = true
}
