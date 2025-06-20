const { SSMClient, GetParametersCommand } = require('@aws-sdk/client-ssm');
const ssm = new SSMClient({});
const { createProbot, createLambdaFunction } = require('@probot/adapter-aws-lambda-serverless');
const appFn = require('./renovate-approve-bot');

const ssmPath = process.env.SSM_PATH || '';

async function getSSMParameters(names, withDecryption = true) {
  const paramNames = names.map(name =>
    name.startsWith('/') ? name : `${ssmPath}/${name}`
  );

  const command = new GetParametersCommand({
    Names: paramNames,
    WithDecryption: withDecryption,
  });

  const response = await ssm.send(command);

  if (response.InvalidParameters && response.InvalidParameters.length > 0) {
    throw new Error(`Invalid parameters: ${response.InvalidParameters.join(', ')}`);
  }

  const result = {};
  for (const param of response.Parameters || []) {
    const key = param.Name.split('/').pop();
    result[key] = param.Value;
  }

  return result;
}

// Wrapper that patches app.log and every listener's context
const wrappedAppFn = (app) => {
  // Ensure app.log exists
  if (typeof app.log !== 'function') {
    app.log = console.log;
  }

  // Patch app.on to intercept event listener registration
  const originalOn = app.on.bind(app); // keep original on()
  app.on = (eventName, callback) => {
    return originalOn(eventName, async (context) => {
      // Patch context.log before bot's handler
      if (typeof context.log !== 'function') {
        context.log = (...args) => console.log(...args);
      }
      return callback(context); // invoke the bot's listener
    });
  };

  return appFn(app); // pass app to bot
};

exports.lambdaFn = async (event, context) => {
  const secrets = await getSSMParameters(
    ['APP_ID', 'PRIVATE_KEY', 'WEBHOOK_SECRET'],
    true
  );

  const probot = createProbot({
    env: {
      LOG_LEVEL: 'debug',
      APP_ID: secrets.APP_ID,
      PRIVATE_KEY: secrets.PRIVATE_KEY,
      WEBHOOK_SECRET: secrets.WEBHOOK_SECRET,
    },
  });

  const handler = createLambdaFunction(wrappedAppFn, { probot });

  return handler(event, context);
};
