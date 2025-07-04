# Debug script to check moto imports
import moto

print("Moto version:", moto.__version__)
print("\nAvailable moto exports:")
available_exports = [x for x in dir(moto) if not x.startswith('_')]
for export in sorted(available_exports):
    print(f"  {export}")

print("\nDynamoDB related exports:")
dynamodb_exports = [x for x in dir(moto) if 'dynamodb' in x.lower()]
for export in dynamodb_exports:
    print(f"  {export}")

print("\nAPI Gateway related exports:")
apigateway_exports = [x for x in dir(moto) if 'apigateway' in x.lower()]
for export in apigateway_exports:
    print(f"  {export}")

# Try to import dynamodb mock
try:
    from moto.dynamodb import mock_dynamodb
    print("\n✅ Successfully imported from moto.dynamodb")
except Exception as e:
    print(f"\n❌ Failed to import from moto.dynamodb: {e}")

try:
    from moto.dynamodb2 import mock_dynamodb
    print("✅ Successfully imported from moto.dynamodb2")
except Exception as e:
    print(f"❌ Failed to import from moto.dynamodb2: {e}")

# Check if it's available with @mock decorator pattern
try:
    from moto.mock_dynamodb import mock_dynamodb
    print("✅ Successfully imported from moto.mock_dynamodb")
except Exception as e:
    print(f"❌ Failed to import from moto.mock_dynamodb: {e}")