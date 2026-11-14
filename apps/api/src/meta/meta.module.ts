import { Global, Module } from "@nestjs/common";
import { MetaConversionsService } from "./meta-conversions.service";

// Global: leads e cadastros de vários módulos avisam a Meta pelo mesmo serviço.
@Global()
@Module({ providers: [MetaConversionsService], exports: [MetaConversionsService] })
export class MetaModule {}
