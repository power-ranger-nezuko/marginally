output "endpoint" {
  value     = aws_db_instance.main.endpoint
  sensitive = true
}

output "db_name" {
  value = aws_db_instance.main.db_name
}

output "username" {
  value = aws_db_instance.main.username
}

output "db_identifier" {
  value = aws_db_instance.main.identifier
}

output "db_password" {
  value     = random_password.db.result
  sensitive = true
}
