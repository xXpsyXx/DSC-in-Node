import { Inject, Injectable } from '@nestjs/common';
import { pool } from '../database';
import { Role } from '../auth/enums/role.enum';

@Injectable()
export class UserService {
  async createUser(
    name: string,
    email: string,
    password: string,
    role: Role = Role.USER,
  ) {
    const result = await pool.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, email, password, role],
    );
    return result.rows[0];
  }

  async findAllUsers() {
    const result = await pool.query('SELECT * FROM users');
    return result.rows;
  }

  async findUserByEmail(email: string) {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [
      email,
    ]);
    return result.rows[0];
  }
}
