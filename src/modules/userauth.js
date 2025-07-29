const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const db = require('./db');

function hash(s){
    return bcrypt.hashSync(s, 12); // Use bcrypt with cost factor 12
}
function randomBytes(size=32){
    return crypto.randomBytes(size).toString('hex');
}
async function verifyPassword(password, hashedPassword) {
    return bcrypt.compare(password, hashedPassword);
}
const _userAuth = new class{
    constructor(){
        this.hash = hash;
        this.randomBytes = randomBytes;
    }
    async createUser(username,password,display_name=false,role=1){
        password = hash(password);
        return db.users.create(username,password,display_name,role);
    }
    async updateUser(userid, username, password, display_name, role){
        return await db.users.modify(userid, username,password, display_name, role);
    }
    async getUserById(userid){
        return await db.users.getById(userid);
    }
    async getUserByUsername(username){
        return await db.users.getByUsername(username);
    }
    async userToken(userid,token){
        return await db.users.setToken(userid,token);
    }
    async login(username, password){
        try {
            let user = await this.getUserByUsername(username);
            const isValidPassword = await verifyPassword(password, user.password);
            if (!isValidPassword) {
                throw new Error('Invalid username or password');
            }
            user.token = (await this.userToken(user.id, this.randomBytes())).token;
            return user;
        } catch (err) {
            // Handle both user not found and other database errors
            if (err.message === 'User not found') {
                throw new Error('Invalid username or password');
            }
            throw err; // Re-throw other errors
        }
    }
}()
module.exports = _userAuth;