CREATE DATABASE festinha;

CREATE TABLE pessoas(
    pid     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nome    VARCHAR(64),
    shash   VARCHAR(256),
    sal     VARCHAR(256),
    avatar  VARCHAR(256)    
);

CREATE TABLE musicas(
    mid     SERIAL UNIQUE,
    link    VARCHAR(128),
    arquivo VARCHAR(512),
    titulo  VARCHAR(512),
    artista VARCHAR(512),
    pessoa  VARCHAR(64),
    criacao TIMESTAMPTZ      
);

CREATE TABLE sessoes (
    sid VARCHAR(512) COLLATE "default",
    sess json NOT NULL,
    expire timestamp(6) NOT NULL,
    CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON sessoes ("expire");