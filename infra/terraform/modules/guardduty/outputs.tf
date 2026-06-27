output "detector_id" {
  description = "ID of the GuardDuty detector, or null when advanced_security is disabled."
  value       = var.enabled ? aws_guardduty_detector.main[0].id : null
}
