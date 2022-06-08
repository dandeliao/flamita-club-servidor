const express = require('express');
const cors = require('cors');
const pool = require('./config/bancodedados.js');
const youtubedl = require('youtube-dl-exec');
var session = require('express-session');
const passport = require('passport');
const genPassword = require('./lib/passwordUtils').genPassword;
const PostgreSqlStore = require('connect-pg-simple')(session);
const fs = require('fs');
const multer = require('multer');
const PORT = process.env.PORT || 5000;

const app = express();

// middleware
app.use(cors({
    origin: 'null',
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({extended: true}));
app.use(express.static('static'));
let upload = multer({ storage: multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'static/avatar')
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname)
    }
})});

// ---
// AUTENTICACAO

require('dotenv').config();
  
let sessionStore = new PostgreSqlStore({
    pool: pool,
    tableName: 'sessoes'
});

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    store: sessionStore,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 // 1 dia
    }
}));

require('./config/passport');

app.use(passport.initialize());
app.use(passport.session());

app.use((req,res, next) => {
    console.log('---');
    next();
});

// verifica autenticação (middleware)
let taAutenticado = (req, res, next) => {
    if (req.isAuthenticated()) {
        next();
    } else {
        res.status(401).json({
            msg: 'você não tem permissão para acessar esse recurso',
            logade: false
        });
    }
}

// ---
// ROTAS

// login

app.post('/login', passport.authenticate('local', {
    failureRedirect: '/login-fracasso',
    successRedirect: '/login-sucesso'
}));

app.get('/login-sucesso', (req, res, next) => {
    console.log('login feito com sucesso');
    console.log('req.user:', req.user);
    res.send({
        mensagem: 'login realizado com sucesso',
        autenticada: true
    });
});

app.get('/login-fracasso', (req, res, next) => {
    console.log('login fracassou');
    res.send({
        mensagem: 'pessoa ou senha não correspondem aos registros',
        autenticada: false
    });
});

// logout

app.post('/logout', (req, res, next) => {
    req.logout(err => {
        if(err){return next(err)}
        res.send('você não está mais logade');
    });
});

// registro de pessoas

app.post('/registro', async(req, res, next) => {
    const saltHash = genPassword(req.body.senha);
    console.log('req.body.senha:', req.body.senha);
    
    const salt = saltHash.salt;
    const hash = saltHash.hash;

    try {
        const novaPessoa = await pool.query(
            'INSERT INTO pessoas(nome, shash, sal, avatar) VALUES($1, $2, $3, $4) RETURNING (nome, shash, sal, avatar)',
            [req.body.nome, hash, salt, 'avatar-padrao.png']
        );
        console.log('pessoa inserida:', novaPessoa);
    } catch (error) {
        console.log(error.message);
    }
    
    res.send({
        mensagem: 'pessoa inserida no banco de dados com sucesso!',
        autenticada: true});
});

// trocar avatar

app.post('/trocar-avatar', taAutenticado, upload.single(`arquivo`), (req, res) => {
   inserirAvatar(req.user.nome, req.file.originalname);
   res.send('avatar trocado com sucesso');
});

// rota protegida

app.get('/rota-protegida', taAutenticado, (req, res, next) => {
    res.send({msg: 'você está na rota protegida!'});
});

// inserir musica

app.post('/musicas', async(req, res, next) => {
    try {
        const { link, titulo, artista } = req.body;
        let videoId = await obterIdVideo(link);
        linkTratado = `https://youtu.be/${videoId}`;

        pool.query(
            'SELECT link FROM musicas WHERE link = $1',
            [linkTratado],
            async(err, gemea) => {
                console.log('gemea', gemea);

                if (gemea.rows[0] && (gemea.rows[0].link === linkTratado)) {
                    console.log('música já existe e não foi inserida');
                    res.send({
                        baixado: false,
                        repetida: true
                    });
                } else {
                    console.log('música não é repetida e será inserida');
                    
                    baixarVideo(linkTratado).then(baixado => {
                        if (baixado) {
                            // adiciona ao banco de dados
                            pool.query(
                                'INSERT INTO musicas(link,  arquivo, titulo, artista, pessoa, criacao) VALUES($1, $2, $3, $4, $5, now()) RETURNING mid, link',
                                [linkTratado, `${videoId}.mp3`, titulo, artista, req.user.nome]
                            ).then(r => {
                                console.log('sucesso ao baixar música: ' + link);
                            });
                        } else {
                            console.log('erro ao baixar musica: ' + link);
                        }
                        console.log('baixado res.send:', { baixado: baixado });
                        res.send({ baixado: baixado });
                    }).catch(e => {
                        console.log(e.message);
                        res.send({ baixado: false });
                        return null;
                    });
                }
        
            });
    } catch (error) {
        console.log(error.message);
        res.send({ baixado: false });
    }
});

// obter informações de uma música

app.get('/musica/:id', async(req, res) => {
    try {
        const musica = await pool.query(
            'SELECT * FROM musicas WHERE mid = $1',
            [req.params.id]
        );
        res.send(musica.rows[0]);
    } catch (error) {
        console.log(error.message);
    }
});

// ver todas as musicas

app.get('/musicas', async(req, res) => {
    try {
        const verMusicas = await pool.query(
            'SELECT * FROM musicas'
        );
        res.send(verMusicas.rows);
    } catch (error) {
        console.log(error.message);
    }
});

// deletar uma musica

app.delete('/musicas/:id', taAutenticado, async (req, res) => {
    console.log('entrou na rota de deletar música');
    try {
        const id = req.params.id;
        const dados = await pool.query(
            'SELECT pessoa, arquivo FROM musicas WHERE mid = $1',
            [id]
        );
        let { pessoa, arquivo } = dados.rows[0];
        console.log(pessoa);
        console.log(arquivo);
        if (req.user.nome === pessoa) {

            try {
                fs.unlink(`./static/${arquivo}`, e => {
                    console.log('media deletada');
                });
            } catch(err) {
                console.log(err);
            }

            pool.query(
                'DELETE FROM musicas WHERE mid = $1',
                [id]
            );
            res.send({
                msg: 'musica deletada com sucesso'
            })
        } else {
            res.status(401).json({
                msg: 'você não tem permissão para deletar essa música'
            })
        }
        
    } catch (error) {
        console.log(error.message);
    }
    
});

// buscar informação de pessoa logada

app.get('/eu', taAutenticado, async (req, res) => {
    try {
        const dados = await pool.query(
            'SELECT nome, avatar FROM pessoas WHERE pid = $1',
            [req.user.pid]
        )
        res.send(JSON.stringify({
            logade: true,
            dados: dados.rows[0]
        }));
    } catch (error) {
        console.log(error.message);
    }
});

// buscar informacao pública de pessoa
app.get('/:pessoa', async (req, res) => {
    let pessoa = req.params.pessoa;
    let resposta = new Object;
    if (req.query.avatar) {
        const avatar = await pool.query(
            'SELECT avatar FROM pessoas WHERE nome = $1',
            [pessoa]
        )
        resposta.avatar = avatar.rows[0].avatar;
    }
    res.send(resposta);
})


// ---
// inicia servidor
let servidor = app.listen(PORT, () => {
    console.log(`servidor rodando na porta ${PORT}...`);
});


// ---
// FUNÇÕES

async function baixarVideo (link) {
    const sucesso = await youtubedl(link, {
            output: './static/%(id)s.%(ext)s',
            extractAudio: true,
            audioFormat: 'mp3',
            audioQuality: 0,
        }).then(output => {
            console.log('musica baixada:', output);
            return true;
        }).catch(erro => {
            console.log('erro ao baixar música');
            return false;
        });
    return sucesso;
}

async function obterIdVideo (link) {
    let id = '';

    if (link.startsWith('https://www.youtube.com/watch?v=')) {
        corte = link.indexOf('&');
        if (corte != -1) {
            id = link.slice(32, corte);
        } else {
            id = link.slice(32);
        }
    } else if (link.startsWith('https://youtu.be/')) {
        id = link.slice(17);
    } else {
        id = '0';
    }

    console.log('video ID:', id);
    return id;
}

async function inserirAvatar (pessoa, nomeArquivo) {
    try {
        await pool.query(
            'UPDATE pessoas SET avatar = $1 WHERE nome = $2',
            [nomeArquivo, pessoa]
        );
        return nomeArquivo;
    } catch (error) {
        console.log(error.message);
        return null;
    }
}