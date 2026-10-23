INSERT OR IGNORE INTO rt_proposals
  (id, author_entity_id, slug, title, body_md, kind, category, phase, created_at)
VALUES
('rt0000','system','ratify-constitution','Ratify the Round Table Constitution','Full constitution — see /community/round-table/constitution','meta','meta','draft',strftime('%s','now')),
('rt0001','system','define-entity','Define "Entity"','Account >=7d, one prior comment/vote, passkey registered.','meta','meta','draft',strftime('%s','now')),
('rt0002','system','default-thresholds','Set Default Thresholds','Quorum max(10,20%). Pass 66%. Block 25%. Meta 75%.','meta','meta','draft',strftime('%s','now')),
('rt0003','system','objectors-bench','Establish the Objector''s Bench','5 members, 30-day sortition terms, 72h delay power.','meta','meta','draft',strftime('%s','now')),
('rt0004','system','execution-bridge','Define the Execution Bridge','v1: config proposals only, worker writes to D1.','meta','meta','draft',strftime('%s','now')),
('rt0005','system','reconsider-window','The Reconsider Window','10% can reopen any resolution within 30 days.','meta','meta','draft',strftime('%s','now')),
('rt0006','system','first-feature','First Feature Proposal (open)','Reserved for the community''s first real product decision.','advisory','feature','draft',strftime('%s','now'));
