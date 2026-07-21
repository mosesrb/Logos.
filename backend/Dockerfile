FROM node:20-slim

# Install necessary build tools for native dependencies like sqlite3
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Create volume mount points for persistent data
RUN mkdir -p /app/database /app/data /app/uploads /app/sessions /app/models /app/ai

EXPOSE 3008

CMD ["npm", "start"]
