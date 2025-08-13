const joi = require('joi');

const _schemas = new class {
    constructor(){}

    // for application registration
    registrationSchema = joi.object({
        username: joi.string()
            .min(3)
            .max(20)
            .required(),
        password: joi.string()
            .min(8)
            .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).+$/)
            .message('Password must be at least 8 characters and include uppercase, lowercase, number, and special character')
            .required(),
        email: joi.string().min(4).email().required(),
        reason: joi.string().min(10).required()
    });
    displayNameSchema = joi.object({
        
    });
    bioSchema = joi.object({
        bio: joi.string()
            .max(500)
            .allow('')
            .message('Bio must be 500 characters or fewer'),
        display_name: joi.string()
            .min(1)
            .max(32)
            .message('Display name must be 1-32 characters long')
            .required()
    })
}()

module.exports = _schemas;