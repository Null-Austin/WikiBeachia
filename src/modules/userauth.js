const crypto = require('node:crypto');
const db = require('./db');

function hash(s){
    return crypto.createHash('sha256').update(s).digest('hex');
}
function randomBytes(size=32){
    return crypto.randomBytes(size).toString('hex');
}
const _userAuth = new class{
    constructor(){
        this.hash = hash;
        this.randomBytes = randomBytes;
    }
    async createUser(username,password,display_name=false,role=1){
        password = hash(password);
        return db.users.create({username,password,display_name,role});
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
}()
module.exports = _userAuth;