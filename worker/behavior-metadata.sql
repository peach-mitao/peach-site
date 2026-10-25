CREATE TABLE IF NOT EXISTS behavior_layouts (
 site TEXT NOT NULL, version TEXT NOT NULL, page TEXT NOT NULL, viewport TEXT NOT NULL, state TEXT NOT NULL, lang TEXT NOT NULL,
 image TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, boxes TEXT NOT NULL, created INTEGER NOT NULL,
 PRIMARY KEY(site,version,page,viewport,state,lang)
);
