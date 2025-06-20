import * as cdk from "aws-cdk-lib";
import * as fs from "fs";
import * as yaml from "js-yaml";
import * as path from "path";
import { RenovateApproveBotStack } from "./renovate-approve-bot";

interface DeploymentConfig {
    name: string;
    appName: string;
    ssmPath: string;
    renovateBotUser?: string;
    renovateApproveBotUser?: string;
}

interface DeploymentsConfig {
    deployments: DeploymentConfig[];
}

// Load deployments from YAML
function loadDeployments(): DeploymentConfig[] {
    const filePath = path.resolve(__dirname, '../deployments.yml');
    const fileContents = fs.readFileSync(filePath, 'utf8');
    const config = yaml.load(fileContents) as DeploymentsConfig;
    return config.deployments;
}

const app = new cdk.App();

// Get single deployment or deploy all
const deploymentName = app.node.tryGetContext('deployment');
const deployments = loadDeployments();

if (deploymentName) {
    // Deploy a specific environment
    const deployment = deployments.find(d => d.name === deploymentName);

    if (!deployment) {
        throw new Error(`Deployment '${deploymentName}' not found in deployments.yml`);
    }

    console.log(`Deploying '${deployment.name}' environment with app name '${deployment.appName}'`);

    new RenovateApproveBotStack(app, `${deployment.appName}-RenovateApproveBotStack`, {
        prefix: deployment.appName,
        ssmPath: deployment.ssmPath,
        renovateBotUser: deployment.renovateBotUser,
        renovateApproveBotUser: deployment.renovateApproveBotUser
    });
} else {
    // Deploy all environments
    console.log(`Deploying all ${deployments.length} environments`);

    deployments.forEach(deployment => {
        console.log(`Creating stack for '${deployment.name}' with app name '${deployment.appName}'`);

        new RenovateApproveBotStack(app, `${deployment.appName}-RenovateApproveBotStack`, {
            prefix: deployment.appName,
            ssmPath: deployment.ssmPath,
            renovateBotUser: deployment.renovateBotUser,
            renovateApproveBotUser: deployment.renovateApproveBotUser
        });
    });
}

app.synth();
