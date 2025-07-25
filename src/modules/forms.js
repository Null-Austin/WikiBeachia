// Form configurations for the flexible form system
const formConfigs = {
  'create-post': {
    title: 'Create New Wiki Page',
    formTitle: 'Create New Wiki Page',
    method: 'POST',
    action: '/api/v1/create-page',
    submitText: 'Create Page',
    fields: [
      {
        name: 'display_name',
        label: 'Page Title',
        type: 'text',
        placeholder: 'Title',
        required: true
      },
      {
        name: 'content',
        label: 'Content',
        type: 'textarea',
        placeholder: 'Content',
        rows: 12,
        required: true
      }
    ]
  },
  
  'login': {
    title: 'Login',
    formTitle: 'Login to Your Account',
    method: 'POST',
    action: '/api/v1/login',
    submitText: 'Login',
    fields: [
      {
        name: 'username',
        label: 'Username',
        type: 'text',
        placeholder: 'Enter your username',
        required: true
      },
      {
        name: 'password',
        label: 'Password',
        type: 'password',
        placeholder: 'Enter your password',
        required: true
      }
    ]
  },
  'register': {
    title: 'Register',
    formTitle: 'Apply for an account',
    method: 'POST',
    action: '/api/v1/users/apply',
    submitText: 'Apply',
    cancelUrl: '/form/login',
    fields: [
      {
        name: 'username',
        label: 'Username',
        type: 'text',
        placeholder: 'Choose a username',
        required: true,
        helpText: 'Must be 3-20 characters long'
      },
      {
        name:'reason',
        label: 'Reason for Registration',
        type: 'textarea',
        placeholder: 'Why do you want to register?',
        required: true
      },
      {
        name: 'email',
        label: 'Email Address',
        type: 'email',
        placeholder: 'your.email@example.com',
        required: true
      },
      // {
      //   name:'phone',
      //   label: 'Phone Number',
      //   type: 'tel',
      //   placeholder: 'Phone number (optional)',
      //   required: false
      // },
      {
        name: 'password',
        label: 'Password',
        type: 'password',
        placeholder: 'Choose a strong password',
        required: true,
        helpText: 'Must be at least 8 characters long'
      },
      {
        name: 'confirm_password',
        label: 'Confirm Password',
        type: 'password',
        placeholder: 'Re-enter your password',
        required: true
      }
    ]
  },
};

module.exports = {
  getFormConfig: (formType) => {
    return formConfigs[formType] || null;
  },
  
  getAllFormTypes: () => {
    return Object.keys(formConfigs);
  },
  
  addFormConfig: (formType, config) => {
    formConfigs[formType] = config;
  }
};
