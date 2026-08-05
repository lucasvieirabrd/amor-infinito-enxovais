ALTER TABLE products ADD COLUMN is_kit BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE kit_components (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  kit_product_id VARCHAR(36) NOT NULL,
  component_product_id VARCHAR(36) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME,
  INDEX idx_kit_components_kit (kit_product_id),
  CONSTRAINT fk_kit_components_kit FOREIGN KEY (kit_product_id) REFERENCES products(id),
  CONSTRAINT fk_kit_components_component FOREIGN KEY (component_product_id) REFERENCES products(id)
) COLLATE utf8mb4_0900_ai_ci;
