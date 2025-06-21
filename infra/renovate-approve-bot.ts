import * as cdk from 'aws-cdk-lib';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';

export interface Properties extends cdk.StackProps {
    readonly prefix: string;
    readonly ssmPath: string;
    readonly renovateBotUser?: string;
    readonly renovateApproveBotUser?: string;
}

export class RenovateApproveBotStack extends cdk.Stack {
    constructor(scope: cdk.App, id: string, props: Properties) {
        super(scope, id, props);

        // HTTP API Gateway
        const api = new cdk.aws_apigatewayv2.HttpApi(this, 'RenovateApproveBotApi', {
            apiName: `${props.prefix}-renovate-approve-bot-api`,
            description: 'API Gateway for Renovate Approve Bot',
        });

        // IAM Role (create first)
        const role = new cdk.aws_iam.Role(this, 'RenovateApproveBotRole', {
            assumedBy: new cdk.aws_iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
            ],
        });

        // Grant permission to retrieve SSM parameters under the provided ssmPath
        role.addToPolicy(new cdk.aws_iam.PolicyStatement({
            actions: [
                "ssm:GetParameter",
                "ssm:GetParameters",
                "ssm:GetParametersByPath"
            ],
            resources: [
                `arn:aws:ssm:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:parameter${props.ssmPath}/*`
            ]
        }));

        // Lambda Function (assign custom role, use logRetention)
        const environment: Record<string, string> = {
            SSM_PATH: props.ssmPath,
        };
        if (props.renovateBotUser) {
            environment.RENOVATE_BOT_USER = props.renovateBotUser;
        }
        if (props.renovateApproveBotUser) {
            environment.RENOVATE_APPROVE_BOT_USER = props.renovateApproveBotUser;
        }

        const lambdaFunction = new NodejsFunction(this, 'RenovateApproveBotFunction', {
            functionName: `${props.prefix}-renovate-approve-bot-function`,
            entry: 'src/index.js',
            handler: 'lambdaFn',
            runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,
            role: role,
            memorySize: 128,
            timeout: cdk.Duration.seconds(10),
            logRetention: cdk.aws_logs.RetentionDays.ONE_DAY,
            environment,
        });

        // Integrate API Gateway with Lambda
        const integration = new cdk.aws_apigatewayv2_integrations.HttpLambdaIntegration(
            'LambdaIntegration',
            lambdaFunction,
        );
        api.addRoutes({
            path: '/webhooks',
            methods: [cdk.aws_apigatewayv2.HttpMethod.POST],
            integration,
        });

        // Grant API Gateway permission to invoke the Lambda function (after all resources are created)
        lambdaFunction.addPermission('ApiGatewayInvokePermission', {
            principal: new cdk.aws_iam.ServicePrincipal('apigateway.amazonaws.com'),
            action: 'lambda:InvokeFunction',
            sourceArn: api.arnForExecuteApi(),
        });

        // Outputs
        new cdk.CfnOutput(this, 'ApiUrl', {
            value: api.url ?? 'No URL',
            description: 'The URL of the Renovate Approve Bot API',
        });
        new cdk.CfnOutput(this, 'LambdaFunctionName', {
            value: lambdaFunction.functionName,
            description: 'The name of the Renovate Approve Bot Lambda function',
        });
        new cdk.CfnOutput(this, 'LogGroupName', {
            value: `/aws/lambda/${lambdaFunction.functionName}`,
            description: 'The name of the CloudWatch Log Group for the Renovate Approve Bot',
        });
        new cdk.CfnOutput(this, 'RoleArn', {
            value: role.roleArn,
            description: 'The ARN of the IAM Role for the Renovate Approve Bot',
        });
    }
}
