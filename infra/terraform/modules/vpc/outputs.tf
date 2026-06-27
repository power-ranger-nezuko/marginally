output "vpc_id" {
  value = aws_vpc.main.id
}

output "public_subnet_ids" {
  value = aws_subnet.public[*].id
}

# Empty list when lean_scale; populated when full_scale.
output "app_subnet_ids" {
  value = aws_subnet.private_app[*].id
}

output "data_subnet_ids" {
  value = aws_subnet.private_data[*].id
}

# Empty list when lean_scale. Used by the ECS module to establish an explicit
# dependency on route table associations before deploying tasks into private
# subnets — guarantees zero-downtime on lean → full transition.
output "app_route_table_association_ids" {
  value = aws_route_table_association.private_app[*].id
}

output "alb_sg_id" {
  value = aws_security_group.alb.id
}

output "app_sg_id" {
  value = aws_security_group.app.id
}

output "db_sg_id" {
  value = aws_security_group.db.id
}

output "redis_sg_id" {
  value = aws_security_group.redis.id
}
