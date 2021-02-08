const aws = require('aws-sdk');
const dynamoDB = new aws.DynamoDB.DocumentClient();

exports.handler = async function (event: any) {
  console.log('Games Request: Start', JSON.stringify(event));
  const tableName = getDynamoDBTableName();
  const game = {
    index: 'Destiny'
  };
  await saveItemToDB(tableName, game);
  console.log('Games Request: End', JSON.stringify(game));
  return createHttpResponse(200, game);
};

const createHttpResponse = (statusCode: number, data: any, contentType = 'application/json'): any => {
  return {
    statusCode: statusCode,
    headers: {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': getAllowedOrigin(),
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE'
    },
    body: JSON.stringify(data)
  };
};

const getDynamoDBTableName = (): string => {
  return process.env.GAMES_TABLE_NAME || '';
};

const getAllowedOrigin = (): string => {
  return process.env.ALLOWED_ORIGIN || '';
};

const getItemFromDB = async (tableName: string, idName: string, id: string): Promise<any> => {
  const params: any = {
    TableName: tableName,
    Key: {
      [idName]: id
    }
  };
  const result = await dynamoDB.get(params).promise();
  return result.Item;
};

const saveItemToDB = async (tableName: string, item: any): Promise<any> => {
  const params = {
    TableName: tableName,
    Item: item
  };
  return dynamoDB.put(params).promise();
};

const queryIndexFromDB = async (tableName: string, indexName: string, keyName: string, index: string): Promise<any> => {
  const keyNameInput = `:${keyName}Input`;
  const params: any = {
    TableName: tableName,
    IndexName: indexName,
    KeyConditionExpression: `${keyName} = ${keyNameInput}`,
    ExpressionAttributeValues: {
      [keyNameInput]: index
    },
  };
  let items: any[] = [];
  let result;
  do {
    result = await dynamoDB.query(params).promise();
    result.Items.forEach((item: any) => items.push(item));
    console.log('LastEvaluatedKey', result.LastEvaluatedKey);
    params.ExclusiveStartKey = result.LastEvaluatedKey;
    console.log('ExclusiveStartKey', params.ExclusiveStartKey);
  } while (typeof result.LastEvaluatedKey != 'undefined');
  return items;
};
