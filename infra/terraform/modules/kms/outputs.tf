output "key_arn" {
  value = aws_kms_key.creds.arn
}

output "key_id" {
  value = aws_kms_key.creds.key_id
}
