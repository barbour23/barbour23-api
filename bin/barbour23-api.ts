#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { Stack } from '../lib/barbour23-api-stack';

const app = new cdk.App();
new Stack(app, 'Barbour23API');
