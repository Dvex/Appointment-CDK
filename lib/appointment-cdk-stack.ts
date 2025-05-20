import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as rds from "aws-cdk-lib/aws-rds";
import * as ec2 from "aws-cdk-lib/aws-ec2";

export class AppointmentCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = ec2.Vpc.fromLookup(this, "DefaultVPC", {
      isDefault: true,
    });

    const rdsSecurityGroup = new ec2.SecurityGroup(this, "RdsSecurityGroup", {
      vpc,
      allowAllOutbound: true,
    });

    // DynamoDB
    const appointmentTable = new dynamodb.Table(this, "Appointments", {
      tableName: "Appointments",
      partitionKey: { name: "appointmentId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST
    });

    appointmentTable.addGlobalSecondaryIndex({
      indexName: "insuredId-index",
      partitionKey: { name: "insuredId", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL
    });

    new cdk.CfnOutput(this, "AppointmentsTableName", {
      value: appointmentTable.tableName,
      exportName: "AppointmentsTableName",
    });

    // SNS
    const topic = new sns.Topic(this, "AppointmentTopic");

    new cdk.CfnOutput(this, "AppointmentTopicArn", {
      value: topic.topicArn,
      exportName: "AppointmentTopicArn",
    });

    // SQS
    const sqsPe = new sqs.Queue(this, "QueuePE");
    const sqsCl = new sqs.Queue(this, "QueueCL");

    topic.addSubscription(new subs.SqsSubscription(sqsPe));
    topic.addSubscription(new subs.SqsSubscription(sqsCl));

    // Cola SQS para PerÃº
    new cdk.CfnOutput(this, "QueuePEName", {
      value: sqsPe.queueArn,
      exportName: "QueuePEName",
    });

    // Cola SQS para Chile
    new cdk.CfnOutput(this, "QueueCLName", {
      value: sqsCl.queueArn,
      exportName: "QueueCLName",
    });

    // EventBridge
    const eventBus = new events.EventBus(this, "AppointmentEventBus", {
      eventBusName: "AppointmentEvents",
    });

    new cdk.CfnOutput(this, "AppointmentEventBusArn", {
      value: eventBus.eventBusArn,
      exportName: "AppointmentEventBusArn",
    });

    new cdk.CfnOutput(this, "AppointmentEventBusName", {
      value: eventBus.eventBusArn,
      exportName: "AppointmentEventBusName",
    });

    const fallbackQueue = new sqs.Queue(this, "BackupQueue");

    new events.Rule(this, "ForwardToSqsRule", {
      eventBus,
      eventPattern: {
        source: ["appointment.handler"],
      },
      targets: [new targets.SqsQueue(fallbackQueue)],
    });

    // Cola SQS final
    new cdk.CfnOutput(this, "BackupQueueArn", {
      value: fallbackQueue.queueArn,
      exportName: "BackupQueueArn",
    });

    // RDS MySQL
    const mysqlInstance = new rds.DatabaseInstance(this, "AppointmentDB", {
      engine: rds.DatabaseInstanceEngine.mysql({
        version: rds.MysqlEngineVersion.VER_8_0,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      credentials: rds.Credentials.fromGeneratedSecret("dbadmin"),
      multiAz: false,
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      databaseName: "appointment_db",
      securityGroups: [rdsSecurityGroup],
      publiclyAccessible: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    mysqlInstance.connections.allowFromAnyIpv4(ec2.Port.tcp(3306));

    new cdk.CfnOutput(this, "AppointmentDbEndpoint", {
      value: mysqlInstance.dbInstanceEndpointAddress,
      exportName: "AppointmentDbEndpoint",
    });

    new cdk.CfnOutput(this, "AppointmentDbPort", {
      value: mysqlInstance.dbInstanceEndpointPort,
      exportName: "AppointmentDbPort",
    });

    new cdk.CfnOutput(this, "AppointmentDbName", {
      value: "appointment_db",
      exportName: "AppointmentDbName",
    });

    if (mysqlInstance.secret) {
      new cdk.CfnOutput(this, "AppointmentDbSecretArn", {
        value: mysqlInstance.secret.secretArn,
        exportName: "AppointmentDbSecretArn",
      });
    }
  }
}
