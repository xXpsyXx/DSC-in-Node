import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { RegisterDto } from './dto/register.dto';
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './dto/login.dto';
import { UserService } from '../user/user.service';
import bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
  ) {}
  async register(registerDTO: RegisterDto) {
    const exisitingUser = await this.userService.findUserByEmail(
      registerDTO.email,
    );
    if (exisitingUser) {
      throw new ConflictException('User with this email already exists');
    }
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(registerDTO.password, saltRounds);
    registerDTO.password = hashedPassword;
    const user = await this.userService.createUser(
      registerDTO.name,
      registerDTO.email,
      registerDTO.password,
      registerDTO.role,
    );

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return {
      status: 'Y',
      token: await this.jwtService.signAsync(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  async getAllUsers() {
    const user = await this.userService.findAllUsers();
    if (user) {
      return user;
    }
    return null;
  }

  async login(loginDto: LoginDto) {
    const existinguser = await this.userService.findUserByEmail(loginDto.email);
    if (!existinguser) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const passwordMatch = await bcrypt.compare(
      loginDto.password,
      existinguser.password,
    );
    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = {
      sub: existinguser.id,
      email: existinguser.email,
      role: existinguser.role,
    };
    return {
      status: 'Y',
      token: await this.jwtService.signAsync(payload),
      user: {
        id: existinguser.id,
        email: existinguser.email,
        name: existinguser.name,
        role: existinguser.role,
      },
    };
  }
}
