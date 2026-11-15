-- =====================================================================
-- Save All: define senhas CONHECIDAS para testar (NÃO use em produção)
--   todos os usuários, exceto o master  ->  senha123
--   master (login: admin)               ->  admin123
-- Senha em hash (bcrypt) não pode ser "descoberta": só trocada por outra.
-- =====================================================================
UPDATE usuarios SET senha_hash = '$2a$10$gSaqVE6JaxFqOw2hLzZG.upSGtnar2nntCPb8//2F0DNecWr9thWi' WHERE perfil <> 'master';
UPDATE usuarios SET senha_hash = '$2a$10$KdSnvKYv32NnD/98uOECRu0GJXuJLeKgLm9FMW.7eUlFDPMo09sqq' WHERE perfil =  'master';

SELECT email, perfil FROM usuarios ORDER BY perfil, email;
