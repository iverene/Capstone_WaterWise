-- Seed 50 raw resident (consumer) accounts for development/testing.
-- Run this in the Supabase SQL Editor AFTER migration.sql
-- (plus fingerprint/system_settings/inactivity migrations).
--
-- Default password ng LAHAT ng seed accounts:  Resident@123
-- (bcrypt hash na naka-embed sa ibaba; palitan agad sa app pagkatapos mag-login.)
--
-- Ligtas itong i-run nang paulit-ulit (ON CONFLICT DO NOTHING).
-- Puroks 1-6, tig-8 o 9 residents bawat purok.

INSERT INTO consumers (username, first_name, middle_name, last_name, email, contact_number, purok_no, password, status)
VALUES
-- Purok 1
('jose.rizal', 'Jose', 'Protacio', 'Rizal', 'jose.rizal@example.com', '+639171000001', 1, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('maria.santos', 'Maria', 'Clara', 'Santos', 'maria.santos@example.com', '+639171000002', 1, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('andres.reyes', 'Andres', NULL, 'Reyes', 'andres.reyes@example.com', '+639171000003', 1, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('gabriela.cruz', 'Gabriela', 'Silang', 'Cruz', 'gabriela.cruz@example.com', '+639171000004', 1, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('emilio.ramos', 'Emilio', NULL, 'Ramos', 'emilio.ramos@example.com', '+639171000005', 1, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('apolinario.torres', 'Apolinario', 'Mabini', 'Torres', 'apolinario.torres@example.com', '+639171000006', 1, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('melchora.navarro', 'Melchora', 'Aquino', 'Navarro', 'melchora.navarro@example.com', '+639171000007', 1, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('graciano.jaena', 'Graciano', 'Lopez', 'Jaena', 'graciano.jaena@example.com', '+639171000008', 1, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('marcela.flores', 'Marcela', NULL, 'Flores', 'marcela.flores@example.com', '+639171000009', 1, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
-- Purok 2
('antonio.mendoza', 'Antonio', 'Luna', 'Mendoza', 'antonio.mendoza@example.com', '+639171000010', 2, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('juan.aquino', 'Juan', 'Luna', 'Aquino', 'juan.aquino@example.com', '+639171000011', 2, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('trinidad.salazar', 'Trinidad', 'Tecson', 'Salazar', 'trinidad.salazar@example.com', '+639171000012', 2, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('mariano.castillo', 'Mariano', NULL, 'Castillo', 'mariano.castillo@example.com', '+639171000013', 2, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('felipe.villanueva', 'Felipe', 'Agoncillo', 'Villanueva', 'felipe.villanueva@example.com', '+639171000014', 2, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('rosa.morales', 'Rosa', 'Sevilla', 'Morales', 'rosa.morales@example.com', '+639171000015', 2, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('pedro.santiago', 'Pedro', NULL, 'Santiago', 'pedro.santiago@example.com', '+639171000016', 2, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('isabelo.reyes', 'Isabelo', 'Delos', 'Reyes', 'isabelo.reyes@example.com', '+639171000017', 2, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('gregoria.jesus', 'Gregoria', NULL, 'De Jesus', 'gregoria.jesus@example.com', '+639171000018', 2, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
-- Purok 3
('miguel.gutierrez', 'Miguel', 'Malvar', 'Gutierrez', 'miguel.gutierrez@example.com', '+639171000019', 3, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('teresa.ortiz', 'Teresa', 'Magbanua', 'Ortiz', 'teresa.ortiz@example.com', '+639171000020', 3, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('simeon.fernandez', 'Simeon', NULL, 'Fernandez', 'simeon.fernandez@example.com', '+639171000021', 3, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('agueda.lopez', 'Agueda', 'Kahabagan', 'Lopez', 'agueda.lopez@example.com', '+639171000022', 3, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('macario.pascual', 'Macario', 'Sakay', 'Pascual', 'macario.pascual@example.com', '+639171000023', 3, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('leon.rodriguez', 'Leon', 'Kilat', 'Rodriguez', 'leon.rodriguez@example.com', '+639171000024', 3, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('josefa.llanes', 'Josefa', NULL, 'Llanes', 'josefa.llanes@example.com', '+639171000025', 3, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('pablo.hernandez', 'Pablo', 'Tecson', 'Hernandez', 'pablo.hernandez@example.com', '+639171000026', 3, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
-- Purok 4
('manuel.quezon', 'Manuel', 'Luis', 'Quezon', 'manuel.quezon@example.com', '+639171000027', 4, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('sergio.osmena', 'Sergio', NULL, 'Osmena', 'sergio.osmena@example.com', '+639171000028', 4, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('jose.laurel', 'Jose', 'Paciano', 'Laurel', 'jose.laurel@example.com', '+639171000029', 4, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('manuel.roxas', 'Manuel', 'Acuna', 'Roxas', 'manuel.roxas@example.com', '+639171000030', 4, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('elpidio.quirino', 'Elpidio', NULL, 'Quirino', 'elpidio.quirino@example.com', '+639171000031', 4, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('ramon.magsaysay', 'Ramon', 'Del Fierro', 'Magsaysay', 'ramon.magsaysay@example.com', '+639171000032', 4, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('carlos.garcia', 'Carlos', 'Polistico', 'Garcia', 'carlos.garcia@example.com', '+639171000033', 4, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('diosdado.macapagal', 'Diosdado', NULL, 'Macapagal', 'diosdado.macapagal@example.com', '+639171000034', 4, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
-- Purok 5
('ferdinand.marcos', 'Ferdinand', 'Edralin', 'Marcos', 'ferdinand.marcos@example.com', '+639171000035', 5, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('corazon.aquino', 'Corazon', 'Cojuangco', 'Aquino', 'corazon.aquino@example.com', '+639171000036', 5, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('fidel.ramos', 'Fidel', 'Valdez', 'Ramos', 'fidel.ramos@example.com', '+639171000037', 5, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('joseph.estrada', 'Joseph', NULL, 'Estrada', 'joseph.estrada@example.com', '+639171000038', 5, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('gloria.arroyo', 'Gloria', 'Macapagal', 'Arroyo', 'gloria.arroyo@example.com', '+639171000039', 5, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('benigno.aquino3', 'Benigno', 'Simeon', 'Aquino III', 'benigno.aquino3@example.com', '+639171000040', 5, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('rodrigo.duterte', 'Rodrigo', NULL, 'Duterte', 'rodrigo.duterte@example.com', '+639171000041', 5, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('maria.robredo', 'Maria', 'Leonor', 'Robredo', 'maria.robredo@example.com', '+639171000042', 5, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
-- Purok 6
('juan.tamad', 'Juan', NULL, 'Tamad', 'juan.tamad@example.com', '+639171000043', 6, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('maria.makiling', 'Maria', 'Sinukuan', 'Makiling', 'maria.makiling@example.com', '+639171000044', 6, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('bernardo.carpio', 'Bernardo', 'Salazar', 'Carpio', 'bernardo.carpio@example.com', '+639171000045', 6, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('darna.narda', 'Narda', NULL, 'Custodio', 'darna.narda@example.com', '+639171000046', 6, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('florante.aladin', 'Florante', 'Cruz', 'Aladin', 'florante.aladin@example.com', '+639171000047', 6, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('laura.fuentebella', 'Laura', 'De la Cruz', 'Fuentebella', 'laura.fuentebella@example.com', '+639171000048', 6, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('ibarra.tasio', 'Crisostomo', NULL, 'Ibarra', 'ibarra.tasio@example.com', '+639171000049', 6, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active'),
('sisa.basilio', 'Sisa', 'Crispin', 'Basilio', 'sisa.basilio@example.com', '+639171000050', 6, '$2b$10$p.T1dsHZsWM0UOoxDHYiZuU9gL3rmC8rp5rm9z/bZWyXKAuyv5Xx6', 'active')
ON CONFLICT DO NOTHING;

-- Verify: dapat 50 rows ang lumabas sa ibaba.
SELECT purok_no, count(*) AS residents
FROM consumers
GROUP BY purok_no
ORDER BY purok_no;

SELECT count(*) AS total_residents FROM consumers;
