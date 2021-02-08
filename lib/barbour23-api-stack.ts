import path = require('path');
import cdk = require('@aws-cdk/core');
import iam = require('@aws-cdk/aws-iam');
import lambda = require('@aws-cdk/aws-lambda');
import apiGateway = require('@aws-cdk/aws-apigateway');
import dynamodb = require('@aws-cdk/aws-dynamodb');

export class Stack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const stackName = 'barbour23-api';
    const allowedOrigin = 'http://barbour23.com';

    // IAM Role
    const lambdaIamRole = this.getLambdaHandlerIamRole(this);

    // Games DynamoDb Table
    const gamesTable = new dynamodb.Table(this, 'GamesTable', {
      partitionKey: { name: 'index', type: dynamodb.AttributeType.STRING },
      serverSideEncryption: true,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST
    });
    this.createQueryDynamoIndexPermissions(lambdaIamRole, gamesTable.tableArn);
    // table.addGlobalSecondaryIndex({
    //   indexName: 'secondary-index',
    //   partitionKey: { name: 'secondaryIndex', type: dynamodb.AttributeType.STRING },
    //   projectionType: dynamodb.ProjectionType.ALL
    // });

    // Games Request Lambda
    let gamesRequestLambda = new lambda.Function(this, `GamesRequestHandler`, this.getLambdaFunctionProps(lambdaIamRole, 'games-request'));

    // Games Lambda DynamoDB Access
    gamesRequestLambda.addEnvironment('GAMES_TABLE_NAME', gamesTable.tableName);
    gamesRequestLambda.addEnvironment('ALLOWED_ORIGIN', allowedOrigin);
    gamesTable.grantReadWriteData(gamesRequestLambda);

    // API Gateway
    const apiGatewayName = `${stackName}-gateway`;
    const policyDocument = this.getLambdaHandlerPolicyDocument();
    const restApiProps = this.getRestApiProps(apiGatewayName, policyDocument, [allowedOrigin]);
    const restApi = new apiGateway.RestApi(this, apiGatewayName, restApiProps);
    const restApiRoute = restApi.root.addResource('api');
    const gamesRoute = restApiRoute.addResource('games');
    const gamesRequestRoute = this.createPathResourceWithLambdaMethod(gamesRoute, 'request', 'POST', gamesRequestLambda, 'GamesRequest');
  }

  getLambdaHandlerIamRole(scope: any): iam.Role {
    return new iam.Role(scope, 'lambdaHanderRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromManagedPolicyName(scope, 'global-deny', 'cloud-services/cloud-services-global-deny'),
        iam.ManagedPolicy.fromManagedPolicyName(scope, 'shared-global-deny', 'cloud-services/cloud-services-shared-global-deny'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
      ],
    });
  }

  getLambdaHandlerPolicyDocument(): iam.PolicyDocument {
    return new iam.PolicyDocument({
      statements: [new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.AnyPrincipal()],
        actions: [
          'execute-api:Invoke'
        ],
        resources: [
          `arn:aws:execute-api:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:*`
        ],
      })]
    });
  }

  getLambdaFunctionProps(role: iam.Role, handlerFilename: string, timeout: number = 5, memory: number = 128): lambda.FunctionProps {
    return {
      runtime: lambda.Runtime.NODEJS_12_X,
      handler: `${handlerFilename}.handler`,
      code: lambda.Code.fromAsset(path.join(__dirname, `../lambdas/${handlerFilename}`)),
      role: role,
      timeout: cdk.Duration.seconds(timeout),
      memorySize: memory
    };
  }

  getRestApiProps(apiGatewayName: string, policy: iam.PolicyDocument, allowedOrigins: string[]): apiGateway.RestApiProps {
    return <apiGateway.RestApiProps>{
      restApiName: apiGatewayName,
      deployOptions: {
        // TODO stageName: environment,
        // Reduce default API Gateway throttling limits, we'll not need such high default rates.
        // This reduces cost in the event of high transaction rate, DDOS etc.
        throttlingRateLimit: 10,
        throttlingBurstLimit: 5,
        // TODO Enable AWS XRay tracing by default.
        // tracingEnabled: true,
        // metricsEnabled: true,
        // dataTraceEnabled: true,
        // loggingLevel: apiGateway.MethodLoggingLevel.INFO
      },
      // TODO cloudWatchRole: false,
      endpointTypes: [apiGateway.EndpointType.REGIONAL],
      policy: policy,
      defaultCorsPreflightOptions: {
        allowOrigins: allowedOrigins
      }
    };
  }

  createPathResourceWithLambdaMethod(resource: apiGateway.Resource, path: string, httpVerb: string, lambdaFunction: lambda.IFunction, methodName: string, authorizer?: apiGateway.RequestAuthorizer) {
    const pathResource = resource.addResource(path);
    pathResource.addMethod(httpVerb, new apiGateway.LambdaIntegration(lambdaFunction), {
      operationName: methodName,
      // TODO authorizationType: apiGateway.AuthorizationType.CUSTOM,
      // authorizer: authorizer
    });
    return pathResource;
  }

  createQueryDynamoIndexPermissions(iamRole: iam.Role, dynamoArn: string) {
    iamRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:Query'
      ],
      resources: [`${dynamoArn}/index/*`]
    }));
  }
}
