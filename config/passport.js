const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const pool = require('./bancodedados.js');
const validPassword = require('../lib/passwordUtils').validPassword;

const customFields = {
    usernameField: 'nome',
    passwordField: 'senha'
};

passport.use(new LocalStrategy(customFields,
    async function(username, password, pronto) {
        console.log('config/passport.js em execução')
        try {
            const pessoa = await pool.query(
                'SELECT * FROM pessoas WHERE nome=$1',
                [username]
            );
            if(pessoa.rows.length > 0) {
                const p = pessoa.rows[0]
                const ehValido = validPassword(password, p.shash, p.sal);
                console.log('p:', p);
                if (ehValido) {
                    return pronto(null, p);
                } else {
                    return pronto(null, false);
                }
            } else {
                return pronto(null, false);
            }
        } catch (error) {
            console.log(error.message);
        }
    }
));

passport.serializeUser((user, pronto) => {
    pronto(null, user.pid);
});

passport.deserializeUser((userId, pronto) => {
    try {
        pool.query(
            'SELECT * FROM pessoas WHERE pid=$1',
            [userId]
        ).then(pessoa => {
            if(pessoa.rows.length > 0) {
                const p = pessoa.rows[0]
                pronto(null, p);
            } else {
                console.log('deserialize - pessoa não encontrada');
                return pronto(null, false);
            }
        });
        
    } catch (error) {
        console.log(error.message);
    }
});