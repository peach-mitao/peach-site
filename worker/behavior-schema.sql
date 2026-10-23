CREATE TABLE IF NOT EXISTS behavior_events (
 id TEXT PRIMARY KEY, session TEXT NOT NULL, view TEXT NOT NULL, tab TEXT NOT NULL,
 at INTEGER NOT NULL, seq INTEGER NOT NULL, site TEXT NOT NULL, page TEXT NOT NULL, layout TEXT NOT NULL,
 viewport TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, lang TEXT NOT NULL, state TEXT NOT NULL,
 kind TEXT NOT NULL, target TEXT NOT NULL, slot INTEGER NOT NULL, x REAL NOT NULL, y REAL NOT NULL,
 px REAL NOT NULL, py REAL NOT NULL, destination TEXT NOT NULL, referrer TEXT NOT NULL, utm TEXT NOT NULL, duration INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS behavior_time ON behavior_events(at);
CREATE INDEX IF NOT EXISTS behavior_site_time ON behavior_events(site,at);
CREATE INDEX IF NOT EXISTS behavior_session ON behavior_events(session,at,seq);
CREATE INDEX IF NOT EXISTS behavior_surface ON behavior_events(site,page,layout,viewport,state,at);
CREATE TABLE IF NOT EXISTS behavior_layouts (
 site TEXT NOT NULL, version TEXT NOT NULL, page TEXT NOT NULL, viewport TEXT NOT NULL, state TEXT NOT NULL, lang TEXT NOT NULL,
 image TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, boxes TEXT NOT NULL, created INTEGER NOT NULL,
 PRIMARY KEY(site,version,page,viewport,state,lang)
);
