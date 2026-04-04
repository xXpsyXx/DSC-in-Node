import { Test, TestingModule } from '@nestjs/testing';
import { SignarService } from './signar.service';

describe('SignarService', () => {
  let service: SignarService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SignarService],
    }).compile();

    service = module.get<SignarService>(SignarService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
