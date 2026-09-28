-- PARTE 1: rodar primeiro no Railway Query
CREATE TABLE IF NOT EXISTS external_sellers (
  id          VARCHAR(36)  NOT NULL,
  name        VARCHAR(255) NOT NULL,
  code        VARCHAR(20)  NOT NULL,
  active      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at  DATETIME     NULL,
  PRIMARY KEY (id),
  CONSTRAINT uq_external_sellers_code UNIQUE (code)
) COLLATE utf8mb4_0900_ai_ci;
