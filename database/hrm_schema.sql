CREATE DATABASE IF NOT EXISTS HRM_Pro
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE HRM_Pro;

CREATE TABLE IF NOT EXISTS employees (
  employee_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(254) NOT NULL,
  department VARCHAR(100) NOT NULL,
  job_title VARCHAR(150) NOT NULL,
  employment_status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (employee_id),
  UNIQUE KEY uq_employees_email (email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS face_templates (
  employee_id BIGINT UNSIGNED NOT NULL,
  encrypted_template LONGBLOB NOT NULL,
  encryption_nonce BINARY(12) NOT NULL,
  authentication_tag BINARY(16) NOT NULL,
  encryption_key_version VARCHAR(64) NOT NULL,
  template_format_version VARCHAR(32) NOT NULL,
  consent_recorded_at DATETIME(6) NOT NULL,
  consent_revoked_at DATETIME(6) NULL,
  expires_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (employee_id),
  CONSTRAINT fk_face_templates_employee
    FOREIGN KEY (employee_id) REFERENCES employees (employee_id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attendance (
  attendance_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id BIGINT UNSIGNED NOT NULL,
  work_date DATE NOT NULL,
  check_in_at DATETIME(6) NULL,
  check_out_at DATETIME(6) NULL,
  attendance_status ENUM('present', 'late', 'absent') NOT NULL,
  attendance_method ENUM('manual', 'face_match') NOT NULL DEFAULT 'manual',
  verified_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (attendance_id),
  UNIQUE KEY uq_attendance_employee_date (employee_id, work_date),
  KEY ix_attendance_work_date (work_date),
  CONSTRAINT fk_attendance_employee
    FOREIGN KEY (employee_id) REFERENCES employees (employee_id)
    ON DELETE CASCADE,
  CONSTRAINT chk_attendance_time_order
    CHECK (check_out_at IS NULL OR check_in_at IS NULL OR check_out_at >= check_in_at)
) ENGINE=InnoDB;
