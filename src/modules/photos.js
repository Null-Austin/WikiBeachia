const fs = require('fs')
const { get } = require('http')
const path = require('path')
const {lookup} = require('mime-types')
let photos = new class{
    constructor(){
        this.imgPath = path.join(__dirname,'../media')
        this.userImgPath = path.join(this.imgPath,'user')
    }
    getPhotos(url){
        let _files = []
        let files = fs.readdirSync(url)
        let x = 0
        files.forEach(file=>{
            let _lookup = lookup(path.join(url,file))
            if (_lookup){
                if (_lookup.startsWith('image/')){
                    _files.push(file)
                }
            }
        })
        return _files
    }
    getUserPhotos(){
        return this.getPhotos(this.userImgPath)
    }
    getGlobalPhotos(){
        return this.getPhotos(this.imgPath)
    }
}()
module.exports = photos

if (require.main === module){
    console.log(photos.getUserPhotos())
}