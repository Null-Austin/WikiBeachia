const fs = require('fs')
const { get } = require('http')
const path = require('path')
module.exports = new class{
    constructor(){
        this.imgPath = path.join(__dirname,'../media')
        this.userImgPath = path.join(this.imgPath,'user')
        console.log(this.getPhotos())
    }
    getPhotos(){
        return fs.readdirSync(this.userImgPath)
    }
}()