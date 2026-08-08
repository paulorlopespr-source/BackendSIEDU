-- ============================================
-- RELACIONAMENTOS DO BANCO SIGEPIN
-- ============================================

-- Relaciona a escola com a secretaria
ALTER TABLE escolas
ADD CONSTRAINT fk_escola_secretaria

    FOREIGN KEY (secretaria_id)
        REFERENCES secretarias(id);

-- Relaciona o usuário com o tipo de usuário
ALTER TABLE usuarios
ADD CONSTRAINT fk_usuario_tipo

    FOREIGN KEY (tipo_usuario_id)
        REFERENCES tipos_usuarios(id);

-- Relaciona o usuário com a escola
ALTER TABLE usuarios
ADD CONSTRAINT fk_usuario_escola

    FOREIGN KEY (escola_id)
        REFERENCES escolas(id);