import { Test, TestingModule } from '@nestjs/testing';
import { DscController } from './dsc.controller';

describe('DscController', () => {
  let controller: DscController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DscController],
    }).compile();

    controller = module.get<DscController>(DscController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
