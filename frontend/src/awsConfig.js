const awsConfig = {
  Auth: {
    Cognito: {
      userPoolId: "us-east-1_a8enAwcyl",
      userPoolClientId: "5o1mg9dtkh7kjuvqu145oafv00",
      loginWith: {
        email: true
      }
    }
  }
};

export default awsConfig;