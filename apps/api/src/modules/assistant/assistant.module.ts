import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { ContentModule } from '../content/content.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { AssistantController } from './assistant.controller.js';
import { AssistantLogService } from './assistant-log.service.js';
import { AssistantService } from './assistant.service.js';
import { AssistantBudgetService } from './assistant-budget.service.js';
import { OperatorController } from './operator.controller.js';
import { OperatorService } from './operator.service.js';

@Module({ imports: [CatalogModule, SettingsModule, ContentModule], controllers: [AssistantController, OperatorController], providers: [AssistantService, AssistantBudgetService, AssistantLogService, OperatorService], exports: [AssistantLogService] })
export class AssistantModule {}
