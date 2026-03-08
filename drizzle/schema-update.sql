-- Add layer_mappings table for storing user-defined mappings between Excel columns and PSD text layers
CREATE TABLE IF NOT EXISTS layer_mappings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  templateId INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  mapping JSON NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id),
  FOREIGN KEY (templateId) REFERENCES psd_templates(id),
  UNIQUE KEY unique_user_template_name (userId, templateId, name)
);

-- Add mapping_id to processing_jobs to track which mapping was used
ALTER TABLE processing_jobs ADD COLUMN mappingId INT AFTER layerMapping;
ALTER TABLE processing_jobs ADD FOREIGN KEY (mappingId) REFERENCES layer_mappings(id);
