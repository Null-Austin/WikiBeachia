const joi = require('joi');

const _schemas = new class {
    constructor(){}

    // for application registration
    registrationSchema = joi.object({
        username: joi.string()
            .pattern(/^[a-zA-Z0-9_]+$/)
            .min(3)
            .max(20)
            .message('Username must contain only letters, numbers, and underscores')
            .required(),
        password: joi.string()
            .min(8)
            .message('Password must be at least 8 characters and include uppercase, lowercase, number, and special character')
            .required(),
        email: joi.string().min(4).email().required(),
        reason: joi.string().min(10).required()
    });

}()

module.exports = _schemas;