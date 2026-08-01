import { Injectable, UnauthorizedException } from "@nestjs/common";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaService } from "../prisma/prisma.service";

const tokenTtl = "8h";

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException("邮箱或密码错误");
    }

    const passwordMatched = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatched) {
      throw new UnauthorizedException("邮箱或密码错误");
    }

    const safeUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    };

    const token = jwt.sign(safeUser, this.jwtSecret, {
      subject: user.id,
      expiresIn: tokenTtl
    });

    return { token, user: safeUser };
  }

  get jwtSecret() {
    return process.env.JWT_SECRET ?? "finserve-local-secret";
  }
}
